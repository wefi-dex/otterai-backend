const express = require('express');
const { body, validationResult } = require('express-validator');
const { getSequelize } = require('../database/connection');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// Get models from sequelize instance
const getModels = () => {
  try {
    const sequelize = getSequelize();
    return {
      Organization: sequelize.models.Organization,
      User: sequelize.models.User
    };
  } catch (error) {
    logger.error('Failed to get models:', error);
    throw new Error('Database not initialized');
  }
};

/**
 * @route   GET /api/v1/organizations
 * @desc    Get all organizations (for super admins)
 * @access  Private (Super Admins)
 */
router.get('/', [
  authenticateToken,
  requireRole(['super_admin'])
], async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;

    const whereClause = {};
    if (status) whereClause.status = status;
    if (type) whereClause.type = type;

    const organizations = await getModels().Organization.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: getModels().User,
          as: 'users',
          attributes: ['id', 'first_name', 'last_name', 'email', 'role']
        }
      ],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: {
        organizations: organizations.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: organizations.count,
          pages: Math.ceil(organizations.count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching organizations:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch organizations',
        code: 'ORGANIZATIONS_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/organizations/:id
 * @desc    Get organization by ID
 * @access  Private (Super Admins, Organization Admins)
 */
router.get('/:id', [
  authenticateToken,
  requireRole(['super_admin', 'admin'])
], async (req, res) => {
  try {
    const { id } = req.params;

    const organization = await getModels().Organization.findByPk(id, {
      include: [
        {
          model: getModels().User,
          as: 'users',
          attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'status']
        }
      ]
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Organization not found',
          code: 'ORGANIZATION_NOT_FOUND'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: organization
    });
  } catch (error) {
    logger.error('Error fetching organization:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch organization',
        code: 'ORGANIZATION_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/organizations
 * @desc    Create new organization
 * @access  Private (Super Admins)
 */
router.post('/', [
  authenticateToken,
  requireRole(['super_admin']),
  body('name').notEmpty().withMessage('Organization name is required'),
  body('type').isIn(['branch', 'headquarters', 'subsidiary']).withMessage('Valid organization type is required'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('phone').optional().notEmpty().withMessage('Phone number cannot be empty'),
  body('subscription_plan').isIn(['beta', 'basic', 'professional', 'enterprise']).withMessage('Valid subscription plan is required')
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

    const {
      name,
      type,
      parent_organization_id,
      address,
      phone,
      email,
      website,
      subscription_plan,
      max_users,
      settings,
      timezone,
      currency
    } = req.body;

    // Create organization
    const organization = await getModels().Organization.create({
      name,
      type,
      parent_organization_id,
      address,
      phone,
      email,
      website,
      subscription_plan,
      max_users: max_users || 10,
      settings: settings || {},
      timezone: timezone || 'America/New_York',
      currency: currency || 'USD',
      subscription_start_date: new Date(),
      subscription_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
    });

    logger.logUserActivity(req.user.id, 'organization_created', {
      organizationId: organization.id,
      name: organization.name,
      type: organization.type
    });

    res.status(201).json({
      success: true,
      data: organization
    });
  } catch (error) {
    logger.error('Error creating organization:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create organization',
        code: 'ORGANIZATION_CREATE_FAILED'
      }
    });
  }
});

/**
 * @route   PUT /api/v1/organizations/:id
 * @desc    Update organization
 * @access  Private (Super Admins, Organization Admins)
 */
router.put('/:id', [
  authenticateToken,
  requireRole(['super_admin', 'admin']),
  body('name').optional().notEmpty().withMessage('Organization name cannot be empty'),
  body('type').optional().isIn(['branch', 'headquarters', 'subsidiary']).withMessage('Valid organization type is required'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('subscription_plan').optional().isIn(['beta', 'basic', 'professional', 'enterprise']).withMessage('Valid subscription plan is required')
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

    const organization = await getModels().Organization.findByPk(id);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Organization not found',
          code: 'ORGANIZATION_NOT_FOUND'
        }
      });
    }

    // Update organization
    await organization.update(updateData);

    logger.logUserActivity(req.user.id, 'organization_updated', {
      organizationId: organization.id,
      updatedFields: Object.keys(updateData)
    });

    res.status(200).json({
      success: true,
      data: organization
    });
  } catch (error) {
    logger.error('Error updating organization:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update organization',
        code: 'ORGANIZATION_UPDATE_FAILED'
      }
    });
  }
});

/**
 * @route   DELETE /api/v1/organizations/:id
 * @desc    Delete organization
 * @access  Private (Super Admins)
 */
router.delete('/:id', [
  authenticateToken,
  requireRole(['super_admin'])
], async (req, res) => {
  try {
    const { id } = req.params;

    const organization = await getModels().Organization.findByPk(id);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Organization not found',
          code: 'ORGANIZATION_NOT_FOUND'
        }
      });
    }

    // Soft delete by setting status to inactive
    await organization.update({ status: 'inactive' });

    logger.logUserActivity(req.user.id, 'organization_deleted', {
      organizationId: organization.id,
      name: organization.name
    });

    res.status(200).json({
      success: true,
      message: 'Organization deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting organization:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete organization',
        code: 'ORGANIZATION_DELETE_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/organizations/:id/branches
 * @desc    Get organization branches
 * @access  Private (Super Admins, Organization Admins)
 */
router.get('/:id/branches', [
  authenticateToken,
  requireRole(['super_admin', 'admin'])
], async (req, res) => {
  try {
    const { id } = req.params;

    const branches = await getModels().Organization.findBranches(id);

    res.status(200).json({
      success: true,
      data: branches
    });
  } catch (error) {
    logger.error('Error fetching organization branches:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch organization branches',
        code: 'BRANCHES_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/organizations/:id/stats
 * @desc    Get organization statistics
 * @access  Private (Super Admins, Organization Admins)
 */
router.get('/:id/stats', [
  authenticateToken,
  requireRole(['super_admin', 'admin'])
], async (req, res) => {
  try {
    const { id } = req.params;

    const organization = await getModels().Organization.findByPk(id, {
      include: [
        {
          model: getModels().User,
          as: 'users',
          attributes: ['id', 'role', 'status']
        }
      ]
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Organization not found',
          code: 'ORGANIZATION_NOT_FOUND'
        }
      });
    }

    // Calculate statistics
    const totalUsers = organization.users.length;
    const activeUsers = organization.users.filter(user => user.status === 'active').length;
    const salesRepresentatives = organization.users.filter(user => user.role === 'sales_representative').length;
    const managers = organization.users.filter(user => user.role === 'sales_manager').length;

    const stats = {
      totalUsers,
      activeUsers,
      salesRepresentatives,
      managers,
      subscriptionPlan: organization.subscriptionPlan,
      maxUsers: organization.maxUsers,
      subscriptionActive: organization.isSubscriptionActive()
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching organization stats:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch organization statistics',
        code: 'ORGANIZATION_STATS_FETCH_FAILED'
      }
    });
  }
});

module.exports = router;
