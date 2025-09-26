const jwt = require('jsonwebtoken');
const { getSequelize } = require('../database/connection');
const { logger } = require('../utils/logger');

// Helper to access initialized models from sequelize instance
const getModels = () => {
  const sequelize = getSequelize();
  return sequelize?.models || {};
};

/**
 * Middleware to authenticate JWT tokens
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const { User, Organization } = getModels();
    if (!User) throw new Error('Models not initialized');

    const user = await User.findByPk(decoded.userId, {
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'type', 'status', 'subscription_plan']
        }
      ]
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid token - user not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.status !== 'active') {
      return res.status(401).json({
        error: 'User account is not active',
        code: 'USER_INACTIVE'
      });
    }

    // Check if organization is active (only if user has an organization)
    if (user.organization && user.organization.status !== 'active') {
      return res.status(401).json({
        error: 'Organization account is not active',
        code: 'ORGANIZATION_INACTIVE'
      });
    }

    // Add user to request object
    req.user = user;
    
    // Update last login time
    await user.update({ last_login_at: new Date() });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        code: 'TOKEN_INVALID'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    logger.error('Authentication error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Middleware to require specific roles
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredRoles: allowedRoles,
        userRole
      });
    }

    next();
  };
};

/**
 * Middleware to require organization access
 */
const requireOrganizationAccess = (organizationIdParam = 'organizationId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const requestedOrgId = req.params[organizationIdParam] || req.body.organizationId;
    const userOrgId = req.user.organizationId;

    // Super admins can access any organization
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Users without an organization can only access resources that don't require organization
    if (!userOrgId) {
      if (requestedOrgId) {
        return res.status(403).json({
          error: 'User does not belong to an organization',
          code: 'NO_ORGANIZATION'
        });
      }
      return next();
    }

    // Users can only access their own organization
    if (requestedOrgId !== userOrgId) {
      return res.status(403).json({
        error: 'Access denied to organization',
        code: 'ORGANIZATION_ACCESS_DENIED'
      });
    }

    next();
  };
};

/**
 * Middleware to require manager access to subordinates
 */
const requireManagerAccess = (userIdParam = 'userId') => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const requestedUserId = req.params[userIdParam] || req.body.userId;
    const managerId = req.user.id;

    // Super admins and admins can access any user
    if (['super_admin', 'admin'].includes(req.user.role)) {
      return next();
    }

    // Managers can only access their subordinates
    if (req.user.role === 'sales_manager') {
      const { User } = getModels();
      if (!User) return res.status(500).json({ error: 'Models not initialized', code: 'MODELS_NOT_INITIALIZED' });
      const subordinate = await User.findOne({
        where: {
          id: requestedUserId,
          manager_id: managerId
        }
      });

      if (!subordinate) {
        return res.status(403).json({
          error: 'Access denied to user',
          code: 'USER_ACCESS_DENIED'
        });
      }
    }

    // Sales representatives can only access their own data
    if (req.user.role === 'sales_representative') {
      if (requestedUserId !== req.user.id) {
        return res.status(403).json({
          error: 'Access denied to user',
          code: 'USER_ACCESS_DENIED'
        });
      }
    }

    next();
  };
};

/**
 * Generate JWT token
 */
const generateToken = (user) => {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organization_id || null
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (user) => {
  const payload = {
    userId: user.id,
    type: 'refresh'
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = async (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    const { User } = getModels();
    if (!User) throw new Error('Models not initialized');
    const user = await User.findByPk(decoded.userId);
    if (!user || user.status !== 'active') {
      throw new Error('User not found or inactive');
    }

    return user;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  requireOrganizationAccess,
  requireManagerAccess,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken
};
