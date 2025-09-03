const express = require('express');
const { body, validationResult } = require('express-validator');
const { getSequelize } = require('../database/connection');
const { requireRole, requireManagerAccess } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// Get models from sequelize instance
const getModels = () => {
  try {
    const sequelize = getSequelize();
    return {
      User: sequelize.models.User
    };
  } catch (error) {
    logger.error('Failed to get models:', error);
    throw new Error('Database not initialized');
  }
};

/**
 * @route   GET /api/v1/users
 * @desc    Get all users for organization
 * @access  Private (Managers, Admins)
 */
router.get('/', [
  requireRole(['sales_manager', 'admin', 'super_admin'])
], async (req, res) => {
  try {
    const { page = 1, limit = 10, role, status } = req.query;
    const organizationId = req.user.organizationId;

    const whereClause = { organizationId };
    if (role) whereClause.role = role;
    if (status) whereClause.status = status;

    const users = await getModels().User.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: {
        users: users.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: users.count,
          pages: Math.ceil(users.count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch users',
        code: 'USERS_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID
 * @access  Private (Managers, Admins, Self)
 */
router.get('/:id', [
  requireManagerAccess('id')
], async (req, res) => {
  try {
    const { id } = req.params;

    const user = await getModels().User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: user.toJSON()
    });
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch user',
        code: 'USER_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/users
 * @desc    Create new user
 * @access  Private (Managers, Admins)
 */
router.post('/', [
  requireRole(['sales_manager', 'admin', 'super_admin']),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
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

    const { email, password, firstName, lastName, role, managerId, phone } = req.body;
    const organizationId = req.user.organizationId;

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

    // Create user
    const user = await getModels().User.create({
      email,
      password,
      firstName,
      lastName,
      role,
      organizationId,
      managerId,
      phone
    });

    logger.logUserActivity(req.user.id, 'user_created', {
      createdUserId: user.id,
      email: user.email,
      role: user.role
    });

    res.status(201).json({
      success: true,
      data: user.toJSON()
    });
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create user',
        code: 'USER_CREATE_FAILED'
      }
    });
  }
});

/**
 * @route   PUT /api/v1/users/:id
 * @desc    Update user
 * @access  Private (Managers, Admins, Self)
 */
router.put('/:id', [
  requireManagerAccess('id'),
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('role').optional().isIn(['sales_representative', 'sales_manager']).withMessage('Valid role is required'),
  body('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Valid status is required')
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

    const { id } = req.params;
    const updateData = req.body;

    const user = await getModels().User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Update user
    await user.update(updateData);

    logger.logUserActivity(req.user.id, 'user_updated', {
      updatedUserId: user.id,
      updatedFields: Object.keys(updateData)
    });

    res.status(200).json({
      success: true,
      data: user.toJSON()
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update user',
        code: 'USER_UPDATE_FAILED'
      }
    });
  }
});

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user
 * @access  Private (Managers, Admins)
 */
router.delete('/:id', [
  requireRole(['sales_manager', 'admin', 'super_admin']),
  requireManagerAccess('id')
], async (req, res) => {
  try {
    const { id } = req.params;

    const user = await getModels().User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Soft delete by setting status to inactive
    await user.update({ status: 'inactive' });

    logger.logUserActivity(req.user.id, 'user_deleted', {
      deletedUserId: user.id,
      email: user.email
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete user',
        code: 'USER_DELETE_FAILED'
      }
    });
  }
});

module.exports = router;
