const express = require('express');
const { body, validationResult } = require('express-validator');
const { getSequelize } = require('../database/connection');
const { requireRole, requireManagerAccess, authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// Get models from sequelize instance
const getModels = () => {
  try {
    const sequelize = getSequelize();
    return {
      SalesCall: sequelize.models.SalesCall,
      User: sequelize.models.User,
      Organization: sequelize.models.Organization
    };
  } catch (error) {
    logger.error('Failed to get models:', error);
    throw new Error('Database not initialized');
  }
};

/**
 * @route   GET /api/v1/sales-calls
 * @desc    Get all sales calls for organization
 * @access  Private (All authenticated users)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, outcome, salesRepresentativeId, startDate, endDate } = req.query;
    const organizationId = req.user.organization_id;
    const { SalesCall, User } = getModels();

    const whereClause = { organization_id: organizationId };
    if (status) whereClause.status = status;
    if (outcome) whereClause.outcome = outcome;
    if (salesRepresentativeId) whereClause.sales_representative_id = salesRepresentativeId;
    if (startDate && endDate) {
      whereClause.appointment_date = {
        [require('sequelize').Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const salesCalls = await SalesCall.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'salesRepresentative',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: User,
          as: 'manager',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['appointment_date', 'DESC']]
    });

    // Debug: Log the first sales call to see what fields are included
    if (salesCalls.rows.length > 0) {
      console.log('First sales call data:', JSON.stringify(salesCalls.rows[0].toJSON(), null, 2));
      console.log('transcript_text field:', salesCalls.rows[0].transcript_text);
    }

    res.status(200).json({
      success: true,
      data: {
        salesCalls: salesCalls.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: salesCalls.count,
          pages: Math.ceil(salesCalls.count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching sales calls:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch sales calls',
        code: 'SALES_CALLS_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/sales-calls/:id
 * @desc    Get sales call by ID
 * @access  Private (All authenticated users)
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const { SalesCall, User } = getModels();

    const salesCall = await SalesCall.findOne({
      where: { id, organization_id: organizationId },
      include: [
        {
          model: User,
          as: 'salesRepresentative',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: User,
          as: 'manager',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    if (!salesCall) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Sales call not found',
          code: 'SALES_CALL_NOT_FOUND'
        }
      });
    }

    // Debug: Log the sales call data
    console.log('Individual sales call data:', JSON.stringify(salesCall.toJSON(), null, 2));
    console.log('transcript_text field:', salesCall.transcript_text);

    res.status(200).json({
      success: true,
      data: salesCall
    });
  } catch (error) {
    logger.error('Error fetching sales call:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch sales call',
        code: 'SALES_CALL_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/sales-calls
 * @desc    Create new sales call
 * @access  Private (Sales Representatives, Managers, Admins)
 */
router.post('/', [
  authenticateToken,
  requireRole(['sales_representative', 'sales_manager', 'admin', 'super_admin']),
  body('customer_name').notEmpty().withMessage('Customer name is required'),
  body('appointment_date').isISO8601().withMessage('Valid appointment date is required'),
  body('sales_representative_id').isUUID().withMessage('Valid sales representative ID is required')
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
      customer_name,
      customer_phone,
      customer_email,
      appointment_date,
      sales_representative_id,
      manager_id,
      notes
    } = req.body;

    const organizationId = req.user.organization_id;
    const { SalesCall } = getModels();

    // Create sales call
    const salesCall = await SalesCall.create({
      customer_name,
      customer_phone,
      customer_email,
      appointment_date,
      sales_representative_id,
      manager_id,
      organization_id: organizationId,
      notes
    });

    logger.logSalesCallEvent('created', salesCall.id, {
      userId: req.user.id,
      customerName: customer_name,
      appointmentDate: appointment_date
    });

    res.status(201).json({
      success: true,
      data: salesCall
    });
  } catch (error) {
    logger.error('Error creating sales call:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create sales call',
        code: 'SALES_CALL_CREATE_FAILED'
      }
    });
  }
});

/**
 * @route   PUT /api/v1/sales-calls/:id
 * @desc    Update sales call
 * @access  Private (Sales Representatives, Managers, Admins)
 */
router.put('/:id', [
  authenticateToken,
  requireRole(['sales_representative', 'sales_manager', 'admin', 'super_admin']),
  body('customer_name').optional().notEmpty().withMessage('Customer name cannot be empty'),
  body('appointment_date').optional().isISO8601().withMessage('Valid appointment date is required'),
  body('status').optional().isIn(['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show']).withMessage('Valid status is required'),
  body('outcome').optional().isIn(['sale', 'no_sale', 'follow_up', 'rescheduled']).withMessage('Valid outcome is required')
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
    const organizationId = req.user.organization_id;
    const { SalesCall } = getModels();

    const salesCall = await SalesCall.findOne({
      where: { id, organization_id: organizationId }
    });

    if (!salesCall) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Sales call not found',
          code: 'SALES_CALL_NOT_FOUND'
        }
      });
    }

    // Update sales call
    await salesCall.update(updateData);

    logger.logSalesCallEvent('updated', salesCall.id, {
      userId: req.user.id,
      updatedFields: Object.keys(updateData)
    });

    res.status(200).json({
      success: true,
      data: salesCall
    });
  } catch (error) {
    logger.error('Error updating sales call:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update sales call',
        code: 'SALES_CALL_UPDATE_FAILED'
      }
    });
  }
});

/**
 * @route   DELETE /api/v1/sales-calls/:id
 * @desc    Delete sales call
 * @access  Private (Managers, Admins)
 */
router.delete('/:id', [
  authenticateToken,
  requireRole(['sales_manager', 'admin', 'super_admin'])
], async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const { SalesCall } = getModels();

    const salesCall = await SalesCall.findOne({
      where: { id, organization_id: organizationId }
    });

    if (!salesCall) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Sales call not found',
          code: 'SALES_CALL_NOT_FOUND'
        }
      });
    }

    await salesCall.destroy();

    logger.logSalesCallEvent('deleted', id, {
      userId: req.user.id
    });

    res.status(200).json({
      success: true,
      message: 'Sales call deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting sales call:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete sales call',
        code: 'SALES_CALL_DELETE_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/sales-calls/:id/start
 * @desc    Start sales call recording
 * @access  Private (Sales Representatives, Managers, Admins)
 */
router.post('/:id/start', [
  authenticateToken,
  requireRole(['sales_representative', 'sales_manager', 'admin', 'super_admin'])
], async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const { SalesCall } = getModels();

    const salesCall = await SalesCall.findOne({
      where: { id, organization_id: organizationId }
    });

    if (!salesCall) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Sales call not found',
          code: 'SALES_CALL_NOT_FOUND'
        }
      });
    }

    // Update status to in progress
    await salesCall.update({
      status: 'in_progress',
      call_start_time: new Date()
    });

    logger.logSalesCallEvent('started', salesCall.id, {
      userId: req.user.id
    });

    res.status(200).json({
      success: true,
      data: salesCall
    });
  } catch (error) {
    logger.error('Error starting sales call:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to start sales call',
        code: 'SALES_CALL_START_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/sales-calls/:id/complete
 * @desc    Complete sales call
 * @access  Private (Sales Representatives, Managers, Admins)
 */
router.post('/:id/complete', [
  authenticateToken,
  requireRole(['sales_representative', 'sales_manager', 'admin', 'super_admin']),
  body('outcome').isIn(['sale', 'no_sale', 'follow_up', 'rescheduled']).withMessage('Valid outcome is required'),
  body('sale_amount').optional().isFloat({ min: 0 }).withMessage('Sale amount must be a positive number')
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
    const { outcome, sale_amount, notes } = req.body;
    const organizationId = req.user.organization_id;
    const { SalesCall } = getModels();

    const salesCall = await SalesCall.findOne({
      where: { id, organization_id: organizationId }
    });

    if (!salesCall) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Sales call not found',
          code: 'SALES_CALL_NOT_FOUND'
        }
      });
    }

    // Update sales call
    await salesCall.update({
      status: 'completed',
      outcome,
      sale_amount,
      call_end_time: new Date(),
      notes
    });

    logger.logSalesCallEvent('completed', salesCall.id, {
      userId: req.user.id,
      outcome,
      saleAmount: sale_amount
    });

    res.status(200).json({
      success: true,
      data: salesCall
    });
  } catch (error) {
    logger.error('Error completing sales call:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to complete sales call',
        code: 'SALES_CALL_COMPLETE_FAILED'
      }
    });
  }
});

module.exports = router;
