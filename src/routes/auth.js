const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { getSequelize } = require('../database/connection');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const emailService = require('../services/emailService');
const crypto = require('crypto');

const router = express.Router();

// Get models from sequelize instance
const getModels = () => {
  try {
    const sequelize = getSequelize();
    return {
      User: sequelize.models.User,
      Organization: sequelize.models.Organization
    };
  } catch (error) {
    logger.error('Failed to get models:', error);
    throw new Error('Database not initialized');
  }
};

/**
 * @route   POST /api/v1/auth/login
 * @desc    User login
 * @access  Public
 */
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await getModels().User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        }
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        }
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Account is not active',
          code: 'ACCOUNT_INACTIVE'
        }
      });
    }

    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Update last login
    await user.update({ lastLoginAt: new Date() });

    logger.logUserActivity(user.id, 'login', {
      email: user.email,
      role: user.role
    });

    res.status(200).json({
      success: true,
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Login failed',
        code: 'LOGIN_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/auth/register
 * @desc    User registration
 * @access  Public
 */
router.post('/register', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('organizationId').isUUID().withMessage('Valid organization ID is required'),
  body('role').isIn(['sales_representative', 'sales_manager']).withMessage('Valid role is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { email, password, firstName, lastName, organizationId, role, managerId } = req.body;

    // Check if user already exists
    const existingUser = await getModels().User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'User with this email already exists',
          code: 'USER_EXISTS'
        }
      });
    }

    // Check if organization exists and is active
    const organization = await getModels().Organization.findByPk(organizationId);
    if (!organization || organization.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid organization',
          code: 'INVALID_ORGANIZATION'
        }
      });
    }

    // Create user
    const user = await getModels().User.create({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      organization_id: organizationId,
      role,
      manager_id: managerId
    });

    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(user.email, user.firstName, organization.name);
    } catch (emailError) {
      logger.error('Failed to send welcome email:', emailError);
      // Don't fail registration if email fails
    }

    logger.logUserActivity(user.id, 'registration', {
      email: user.email,
      role: user.role,
      organizationId: user.organizationId
    });

    res.status(201).json({
      success: true,
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Registration failed',
        code: 'REGISTRATION_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { email } = req.body;

    // Find user by email
    const user = await getModels().User.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token in user record
    await user.update({
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetTokenExpiry
    });

    // Send password reset email
    try {
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`;
      await emailService.sendPasswordResetEmail(user.email, user.firstName, resetToken, resetUrl);
      
      logger.logUserActivity(user.id, 'password_reset_requested', {
        email: user.email
      });

      res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    } catch (emailError) {
      logger.error('Failed to send password reset email:', emailError);
      
      // Remove the reset token if email failed
      await user.update({
        resetPasswordToken: null,
        resetPasswordExpires: null
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to send password reset email',
          code: 'EMAIL_SEND_FAILED'
        }
      });
    }
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Password reset request failed',
        code: 'PASSWORD_RESET_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { token, password } = req.body;

    // Find user with valid reset token
    const user = await getModels().User.findOne({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { [require('sequelize').Op.gt]: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid or expired reset token',
          code: 'INVALID_RESET_TOKEN'
        }
      });
    }

    // Update password and clear reset token
    await user.update({
      password,
      resetPasswordToken: null,
      resetPasswordExpires: null
    });

    logger.logUserActivity(user.id, 'password_reset_completed', {
      email: user.email
    });

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
        error: {
        message: 'Password reset failed',
        code: 'PASSWORD_RESET_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', [
  body('refreshToken').notEmpty().withMessage('Refresh token is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { refreshToken } = req.body;

    // Verify refresh token
    const user = await verifyRefreshToken(refreshToken);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        }
      });
    }

    // Generate new tokens
    const accessToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
      }
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      error: {
        message: 'Token refresh failed',
        code: 'REFRESH_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/auth/logout
 * @desc    User logout
 * @access  Private
 */
router.post('/logout', async (req, res) => {
  try {
    // In a more sophisticated implementation, you might want to blacklist the token
    // For now, we'll just return success
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Logout failed',
        code: 'LOGOUT_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', async (req, res) => {
  try {
    // This route would typically use authentication middleware
    // For now, we'll return a placeholder
    res.status(200).json({
      success: true,
      data: {
        message: 'User profile endpoint - requires authentication middleware'
      }
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get profile',
        code: 'PROFILE_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/auth/setup-first-admin
 * @desc    Setup first super admin user and organization (development only)
 * @access  Public (but should be restricted in production)
 */
router.post('/setup-first-admin', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('organizationName').notEmpty().withMessage('Organization name is required')
], async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'First admin setup not allowed in production',
          code: 'FORBIDDEN'
        }
      });
    }

    // Check if any users already exist
    const existingUsers = await getModels().User.count();
    if (existingUsers > 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Users already exist. Cannot setup first admin.',
          code: 'USERS_EXIST'
        }
      });
    }

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { email, password, firstName, lastName, organizationName } = req.body;

    // Check if user already exists
    const existingUser = await getModels().User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'User with this email already exists',
          code: 'USER_EXISTS'
        }
      });
    }

    // Create organization first
    const organization = await getModels().Organization.create({
      name: organizationName,
      type: 'headquarters',
      status: 'active',
      subscription_plan: 'enterprise',
      subscription_status: 'active',
      max_users: 1000,
      settings: {},
      otter_a_i_config: {},
      currency: 'USD',
      timezone: 'America/New_York'
    });

    // Create super admin user
    const user = await getModels().User.create({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      organization_id: organization.id,
      role: 'super_admin',
      status: 'active'
    });

    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    logger.logUserActivity(user.id, 'first_admin_setup', {
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: organization.name
    });

    res.status(201).json({
      success: true,
      message: 'First super admin and organization created successfully',
      data: {
        user: user.toJSON(),
        organization: {
          id: organization.id,
          name: organization.name,
          type: organization.type
        },
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
      }
    });
  } catch (error) {
    logger.error('First admin setup error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'First admin setup failed',
        code: 'SETUP_FAILED'
      }
    });
  }
});

module.exports = router;
