const express = require('express');
const { body, validationResult } = require('express-validator');
const { getSequelize } = require('../database/connection');
const { requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// Get models from sequelize instance
const getModels = () => {
  try {
    const sequelize = getSequelize();
    return {
      User: sequelize.models.User,
      Organization: sequelize.models.Organization,
      SalesCall: sequelize.models.SalesCall,
      Analytics: sequelize.models.Analytics
    };
  } catch (error) {
    logger.error('Failed to get models:', error);
    throw new Error('Database not initialized');
  }
};

/**
 * @route   GET /api/v1/admin/dashboard
 * @desc    Get admin dashboard data
 * @access  Private (Admins, Super Admins)
 */
router.get('/dashboard', [
  requireRole(['admin', 'super_admin'])
], async (req, res) => {
  try {
    const organizationId = req.user.organizationId;

    // Get system statistics
    const totalUsers = await getModels().User.count({ where: { organizationId } });
    const activeUsers = await getModels().User.count({ 
      where: { organizationId, status: 'active' } 
    });
    const totalSalesCalls = await getModels().SalesCall.count({ where: { organizationId } });
    const completedSalesCalls = await getModels().SalesCall.count({ 
      where: { organizationId, status: 'completed' } 
    });

    // Get recent activity
    const recentSalesCalls = await getModels().SalesCall.findAll({
      where: { organizationId },
      include: [
        {
          model: getModels().User,
          as: 'salesRepresentative',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    // Get top performers
    const topPerformers = await getModels().SalesCall.findAll({
      where: { 
        organizationId,
        status: 'completed',
        performanceScore: { [require('sequelize').Op.not]: null }
      },
      include: [
        {
          model: getModels().User,
          as: 'salesRepresentative',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['performanceScore', 'DESC']],
      limit: 5
    });

    const dashboard = {
      stats: {
        totalUsers,
        activeUsers,
        totalSalesCalls,
        completedSalesCalls
      },
      recentActivity: recentSalesCalls,
      topPerformers
    };

    res.status(200).json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    logger.error('Error fetching admin dashboard:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch admin dashboard',
        code: 'ADMIN_DASHBOARD_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/admin/system-stats
 * @desc    Get system-wide statistics (Super Admin only)
 * @access  Private (Super Admins)
 */
router.get('/system-stats', [
  requireRole(['super_admin'])
], async (req, res) => {
  try {
    // Get system-wide statistics
    const totalOrganizations = await getModels().Organization.count();
    const activeOrganizations = await getModels().Organization.count({ 
      where: { status: 'active' } 
    });
    const totalUsers = await getModels().User.count();
    const activeUsers = await getModels().User.count({ where: { status: 'active' } });
    const totalSalesCalls = await getModels().SalesCall.count();
    const completedSalesCalls = await getModels().SalesCall.count({ 
      where: { status: 'completed' } 
    });

    // Get subscription statistics
    const subscriptionStats = await getModels().Organization.findAll({
      attributes: [
        'subscriptionPlan',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['subscriptionPlan']
    });

    const systemStats = {
      organizations: {
        total: totalOrganizations,
        active: activeOrganizations
      },
      users: {
        total: totalUsers,
        active: activeUsers
      },
      salesCalls: {
        total: totalSalesCalls,
        completed: completedSalesCalls
      },
      subscriptions: subscriptionStats
    };

    res.status(200).json({
      success: true,
      data: systemStats
    });
  } catch (error) {
    logger.error('Error fetching system stats:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch system statistics',
        code: 'SYSTEM_STATS_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/admin/users
 * @desc    Get all users for admin management
 * @access  Private (Admins, Super Admins)
 */
router.get('/users', [
  requireRole(['admin', 'super_admin'])
], async (req, res) => {
  try {
    const { page = 1, limit = 20, role, status, organizationId } = req.query;
    const userOrgId = req.user.organizationId;

    const whereClause = {};
    
    // Super admins can see all users, regular admins only see their organization
    if (req.user.role === 'admin') {
      whereClause.organizationId = userOrgId;
    } else if (organizationId) {
      whereClause.organizationId = organizationId;
    }
    
    if (role) whereClause.role = role;
    if (status) whereClause.status = status;

    const users = await getModels().User.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: getModels().Organization,
          as: 'organization',
          attributes: ['id', 'name', 'type']
        }
      ],
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
    logger.error('Error fetching admin users:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch users',
        code: 'ADMIN_USERS_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   PUT /api/v1/admin/users/:id/status
 * @desc    Update user status
 * @access  Private (Admins, Super Admins)
 */
router.put('/users/:id/status', [
  requireRole(['admin', 'super_admin']),
  body('status').isIn(['active', 'inactive', 'suspended']).withMessage('Valid status is required')
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
    const { status } = req.body;
    const userOrgId = req.user.organizationId;

    // Find user
    const whereClause = { id };
    if (req.user.role === 'admin') {
      whereClause.organizationId = userOrgId;
    }

    const user = await getModels().User.findOne({ where: whereClause });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Update user status
    await user.update({ status });

    logger.logUserActivity(req.user.id, 'user_status_updated', {
      targetUserId: user.id,
      newStatus: status
    });

    res.status(200).json({
      success: true,
      data: user.toJSON()
    });
  } catch (error) {
    logger.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update user status',
        code: 'USER_STATUS_UPDATE_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/admin/analytics
 * @desc    Get admin analytics
 * @access  Private (Admins, Super Admins)
 */
router.get('/analytics', [
  requireRole(['admin', 'super_admin'])
], async (req, res) => {
  try {
    const { startDate, endDate, organizationId } = req.query;
    const userOrgId = req.user.organizationId;

    const whereClause = {};
    
    // Super admins can see all data, regular admins only see their organization
    if (req.user.role === 'admin') {
      whereClause.organizationId = userOrgId;
    } else if (organizationId) {
      whereClause.organizationId = organizationId;
    }
    
    if (startDate && endDate) {
      whereClause.appointmentDate = {
        [require('sequelize').Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // Get sales calls data
    const salesCalls = await getModels().SalesCall.findAll({
      where: whereClause,
      include: [
        {
          model: getModels().User,
          as: 'salesRepresentative',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: getModels().Organization,
          as: 'organization',
          attributes: ['id', 'name']
        }
      ],
      order: [['appointmentDate', 'DESC']]
    });

    // Calculate metrics
    const totalCalls = salesCalls.length;
    const completedCalls = salesCalls.filter(call => call.status === 'completed').length;
    const successfulSales = salesCalls.filter(call => call.outcome === 'sale').length;
    const totalRevenue = salesCalls
      .filter(call => call.saleAmount)
      .reduce((sum, call) => sum + parseFloat(call.saleAmount), 0);

    const averagePerformanceScore = salesCalls
      .filter(call => call.performanceScore)
      .reduce((sum, call) => sum + parseFloat(call.performanceScore), 0) /
      salesCalls.filter(call => call.performanceScore).length || 0;

    const conversionRate = completedCalls > 0 ? (successfulSales / completedCalls) * 100 : 0;

    // Get organization breakdown
    const orgStats = {};
    salesCalls.forEach(call => {
      const orgId = call.organizationId;
      if (!orgStats[orgId]) {
        orgStats[orgId] = {
          organizationId: orgId,
          organizationName: call.organization.name,
          totalCalls: 0,
          completedCalls: 0,
          successfulSales: 0,
          totalRevenue: 0
        };
      }
      
      orgStats[orgId].totalCalls++;
      if (call.status === 'completed') {
        orgStats[orgId].completedCalls++;
      }
      if (call.outcome === 'sale') {
        orgStats[orgId].successfulSales++;
        orgStats[orgId].totalRevenue += parseFloat(call.saleAmount || 0);
      }
    });

    const analytics = {
      overview: {
        totalCalls,
        completedCalls,
        successfulSales,
        totalRevenue,
        averagePerformanceScore,
        conversionRate
      },
      organizationBreakdown: Object.values(orgStats),
      recentCalls: salesCalls.slice(0, 20)
    };

    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Error fetching admin analytics:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch admin analytics',
        code: 'ADMIN_ANALYTICS_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/admin/bulk-actions
 * @desc    Perform bulk actions on users
 * @access  Private (Admins, Super Admins)
 */
router.post('/bulk-actions', [
  requireRole(['admin', 'super_admin']),
  body('action').isIn(['activate', 'deactivate', 'suspend']).withMessage('Valid action is required'),
  body('userIds').isArray().withMessage('User IDs array is required')
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

    const { action, userIds } = req.body;
    const userOrgId = req.user.organizationId;

    // Determine status based on action
    let status;
    switch (action) {
      case 'activate':
        status = 'active';
        break;
      case 'deactivate':
        status = 'inactive';
        break;
      case 'suspend':
        status = 'suspended';
        break;
      default:
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid action',
            code: 'INVALID_ACTION'
          }
        });
    }

    // Build where clause
    const whereClause = {
      id: { [require('sequelize').Op.in]: userIds }
    };
    
    if (req.user.role === 'admin') {
      whereClause.organizationId = userOrgId;
    }

    // Update users
    const result = await getModels().User.update(
      { status },
      { where: whereClause }
    );

    logger.logUserActivity(req.user.id, 'bulk_user_action', {
      action,
      status,
      affectedUsers: userIds.length,
      updatedCount: result[0]
    });

    res.status(200).json({
      success: true,
      data: {
        action,
        status,
        affectedUsers: userIds.length,
        updatedCount: result[0]
      }
    });
  } catch (error) {
    logger.error('Error performing bulk action:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to perform bulk action',
        code: 'BULK_ACTION_FAILED'
      }
    });
  }
});

module.exports = router;
