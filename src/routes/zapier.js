const express = require('express');
const { body, validationResult } = require('express-validator');
const { getSequelize } = require('../database/connection');
const { requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { Op } = require('sequelize');

const router = express.Router();

// Get models from sequelize instance
const getModels = () => {
  try {
    const sequelize = getSequelize();
    return {
      User: sequelize.models.User,
      SalesCall: sequelize.models.SalesCall,
      Organization: sequelize.models.Organization,
      Analytics: sequelize.models.Analytics,
      Notification: sequelize.models.Notification
    };
  } catch (error) {
    logger.error('Failed to get models:', error);
    throw new Error('Database not initialized');
  }
};

/**
 * @route   POST /api/v1/zapier/webhook/sales-call-completed
 * @desc    Webhook endpoint for Zapier to trigger when a sales call is completed
 * @access  Public (Zapier webhook)
 */
router.post('/webhook/sales-call-completed', [
  body('salesCallId').isUUID().withMessage('Valid sales call ID is required'),
  body('organizationId').isUUID().withMessage('Valid organization ID is required'),
  body('eventType').isIn(['completed', 'analyzed', 'failed']).withMessage('Valid event type is required'),
  body('data').optional().isObject().withMessage('Data must be an object')
], async (req, res) => {
  try {
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

    const { salesCallId, organizationId, eventType, data } = req.body;

    // Log the webhook event
    logger.logZapierEvent('sales_call_completed', {
      salesCallId,
      organizationId,
      eventType,
      data
    });

    // You can add custom logic here to trigger other Zapier workflows
    // For example, sending notifications, updating CRM, etc.

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: {
        salesCallId,
        eventType,
        processedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error processing Zapier webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Webhook processing failed',
        code: 'WEBHOOK_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/zapier/webhook/performance-alert
 * @desc    Webhook endpoint for Zapier to trigger performance alerts
 * @access  Public (Zapier webhook)
 */
router.post('/webhook/performance-alert', [
  body('userId').isUUID().withMessage('Valid user ID is required'),
  body('organizationId').isUUID().withMessage('Valid organization ID is required'),
  body('alertType').isIn(['low_performance', 'high_performance', 'script_violation', 'objection_handling']).withMessage('Valid alert type is required'),
  body('metrics').isObject().withMessage('Metrics object is required'),
  body('threshold').optional().isNumeric().withMessage('Threshold must be a number')
], async (req, res) => {
  try {
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

    const { userId, organizationId, alertType, metrics, threshold } = req.body;

    // Log the performance alert
    logger.logZapierEvent('performance_alert', {
      userId,
      organizationId,
      alertType,
      metrics,
      threshold
    });

    // Create notification for the user/manager
    const { Notification } = getModels();
    await Notification.create({
      organizationId,
      userId,
      type: 'performance_alert',
      title: `Performance Alert: ${alertType.replace('_', ' ').toUpperCase()}`,
      message: `Performance metrics have triggered an alert. Check your dashboard for details.`,
      priority: 'high',
      status: 'unread',
      actionUrl: `/analytics/user/${userId}`,
      metadata: {
        alertType,
        metrics,
        threshold
      }
    });

    res.status(200).json({
      success: true,
      message: 'Performance alert processed successfully',
      data: {
        userId,
        alertType,
        processedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error processing performance alert webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Performance alert processing failed',
        code: 'ALERT_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/zapier/triggers/sales-calls
 * @desc    Get sales calls for Zapier triggers (polling)
 * @access  Private (Zapier API key)
 */
router.get('/triggers/sales-calls', [
  // authenticateToken, // Removed as per new_code
  // requireRole(['admin', 'super_admin']) // Removed as per new_code
], async (req, res) => {
  try {
    const { 
      organizationId, 
      status = 'completed', 
      startDate, 
      endDate, 
      limit = 50 
    } = req.query;

    const { SalesCall, User, Organization } = getModels();

    const whereClause = {
      status: status
    };

    if (organizationId) {
      whereClause.organizationId = organizationId;
    }

    if (startDate && endDate) {
      whereClause.callStartTime = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const salesCalls = await SalesCall.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'salesRepresentative',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name']
        }
      ],
      order: [['callStartTime', 'DESC']],
      limit: parseInt(limit)
    });

    res.status(200).json({
      success: true,
      data: salesCalls.map(call => ({
        id: call.id,
        customerName: call.customerName,
        customerEmail: call.customerEmail,
        customerPhone: call.customerPhone,
        appointmentDate: call.appointmentDate,
        callStartTime: call.callStartTime,
        callEndTime: call.callEndTime,
        duration: call.duration,
        status: call.status,
        outcome: call.outcome,
        saleAmount: call.saleAmount,
        performanceScore: call.performanceScore,
        salesRepresentative: call.salesRepresentative,
        organization: call.organization,
        createdAt: call.createdAt,
        updatedAt: call.updatedAt
      }))
    });
  } catch (error) {
    logger.error('Error fetching sales calls for Zapier:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch sales calls',
        code: 'FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/zapier/triggers/performance-alerts
 * @desc    Get performance alerts for Zapier triggers
 * @access  Private (Zapier API key)
 */
router.get('/triggers/performance-alerts', [
  // authenticateToken, // Removed as per new_code
  // requireRole(['admin', 'super_admin']) // Removed as per new_code
], async (req, res) => {
  try {
    const { 
      organizationId, 
      alertType, 
      startDate, 
      endDate, 
      limit = 50 
    } = req.query;

    const { Notification, User, Organization } = getModels();

    const whereClause = {
      type: 'performance_alert',
      status: 'unread'
    };

    if (organizationId) {
      whereClause.organizationId = organizationId;
    }

    if (alertType) {
      whereClause.metadata = {
        alertType: alertType
      };
    }

    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const alerts = await Notification.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    res.status(200).json({
      success: true,
      data: alerts.map(alert => ({
        id: alert.id,
        title: alert.title,
        message: alert.message,
        priority: alert.priority,
        alertType: alert.metadata?.alertType,
        metrics: alert.metadata?.metrics,
        threshold: alert.metadata?.threshold,
        user: alert.user,
        organization: alert.organization,
        createdAt: alert.createdAt
      }))
    });
  } catch (error) {
    logger.error('Error fetching performance alerts for Zapier:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch performance alerts',
        code: 'FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/zapier/actions/create-sales-call
 * @desc    Create a new sales call via Zapier action
 * @access  Private (Zapier API key)
 */
router.post('/actions/create-sales-call', [
  // authenticateToken, // Removed as per new_code
  // requireRole(['admin', 'super_admin', 'sales_manager']) // Removed as per new_code
], async (req, res) => {
  try {
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
      customerName,
      customerEmail,
      customerPhone,
      appointmentDate,
      salesRepresentativeId,
      organizationId,
      notes
    } = req.body;

    const { SalesCall, User } = getModels();

    const salesCall = await SalesCall.create({
      customerName,
      customerEmail,
      customerPhone,
      appointmentDate: new Date(appointmentDate),
      salesRepresentativeId,
      organizationId,
      notes,
      status: 'scheduled'
    });

    logger.logZapierEvent('sales_call_created', {
      salesCallId: salesCall.id,
      organizationId,
      salesRepresentativeId
    });

    res.status(201).json({
      success: true,
      data: {
        id: salesCall.id,
        customerName: salesCall.customerName,
        customerEmail: salesCall.customerEmail,
        customerPhone: salesCall.customerPhone,
        appointmentDate: salesCall.appointmentDate,
        status: salesCall.status,
        createdAt: salesCall.createdAt
      }
    });
  } catch (error) {
    logger.error('Error creating sales call via Zapier:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create sales call',
        code: 'CREATION_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/zapier/actions/send-notification
 * @desc    Send notification via Zapier action
 * @access  Private (Zapier API key)
 */
router.post('/actions/send-notification', [
  // authenticateToken, // Removed as per new_code
  // requireRole(['admin', 'super_admin', 'sales_manager']) // Removed as per new_code
], async (req, res) => {
  try {
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
      userId,
      organizationId,
      title,
      message,
      priority = 'medium',
      type = 'info'
    } = req.body;

    const { Notification } = getModels();

    const notification = await Notification.create({
      organizationId,
      userId,
      type,
      title,
      message,
      priority,
      status: 'unread'
    });

    logger.logZapierEvent('notification_sent', {
      notificationId: notification.id,
      userId,
      organizationId,
      type
    });

    res.status(201).json({
      success: true,
      data: {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        type: notification.type,
        status: notification.status,
        createdAt: notification.createdAt
      }
    });
  } catch (error) {
    logger.error('Error sending notification via Zapier:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to send notification',
        code: 'NOTIFICATION_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/zapier/search/users
 * @desc    Search users for Zapier dynamic dropdown
 * @access  Private (Zapier API key)
 */
router.get('/search/users', [
  // authenticateToken, // Removed as per new_code
  // requireRole(['admin', 'super_admin']) // Removed as per new_code
], async (req, res) => {
  try {
    const { organizationId, role, query } = req.query;

    const { User, Organization } = getModels();

    const whereClause = {};

    if (organizationId) {
      whereClause.organizationId = organizationId;
    }

    if (role) {
      whereClause.role = role;
    }

    if (query) {
      whereClause[Op.or] = [
        { firstName: { [Op.iLike]: `%${query}%` } },
        { lastName: { [Op.iLike]: `%${query}%` } },
        { email: { [Op.iLike]: `%${query}%` } }
      ];
    }

    const users = await getModels().User.findAll({
      where: whereClause,
      attributes: ['id', 'firstName', 'lastName', 'email', 'role'],
      order: [['firstName', 'ASC']],
      limit: 100
    });

    res.status(200).json({
      success: true,
      data: users.map(user => ({
        id: user.id,
        label: `${user.firstName} ${user.lastName} (${user.email})`,
        value: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }))
    });
  } catch (error) {
    logger.error('Error searching users for Zapier:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to search users',
        code: 'SEARCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/zapier/search/organizations
 * @desc    Search organizations for Zapier dynamic dropdown
 * @access  Private (Zapier API key)
 */
router.get('/search/organizations', [
  // authenticateToken, // Removed as per new_code
  // requireRole(['super_admin']) // Removed as per new_code
], async (req, res) => {
  try {
    const { query } = req.query;

    const { Organization } = getModels();

    const whereClause = {};

    if (query) {
      whereClause.name = { [Op.iLike]: `%${query}%` };
    }

    const organizations = await Organization.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'type'],
      order: [['name', 'ASC']],
      limit: 100
    });

    res.status(200).json({
      success: true,
      data: organizations.map(org => ({
        id: org.id,
        label: `${org.name} (${org.type})`,
        value: org.id,
        name: org.name,
        type: org.type
      }))
    });
  } catch (error) {
    logger.error('Error searching organizations for Zapier:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to search organizations',
        code: 'SEARCH_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/zapier/actions/otterai-analyze
 * @desc    Receive analyzed data from OtterAI via Zapier
 * @access  Public (OtterAI webhook)
 */
router.post('/actions/otterai-analyze', [
  body('transcript_data').optional().isString().withMessage('Transcript data must be a string'),
  body('analyzed_data').optional().isObject().withMessage('Analyzed data must be an object'),
  body('captured_data').optional().isObject().withMessage('Captured data must be an object'),
  body('salesCallId').optional().isUUID().withMessage('Valid sales call ID is required if provided'),
  body('organizationId').optional().isUUID().withMessage('Valid organization ID is required if provided'),
  body('userId').optional().isUUID().withMessage('Valid user ID is required if provided')
], async (req, res) => {
  try {
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
      transcript_data, 
      analyzed_data, 
      captured_data, 
      salesCallId, 
      organizationId, 
      userId 
    } = req.body;

    // Log the OtterAI data received
    logger.logZapierEvent('otterai_analyze', {
      salesCallId,
      organizationId,
      userId,
      hasTranscript: !!transcript_data,
      hasAnalyzedData: !!analyzed_data,
      hasCapturedData: !!captured_data
    });

    // If we have a sales call ID, update the sales call with the analyzed data
    if (salesCallId) {
      try {
        const { SalesCall } = getModels();
        
        const salesCall = await SalesCall.findByPk(salesCallId);
        if (salesCall) {
          // Update the sales call with analyzed data
          await salesCall.update({
            analysis_data: analyzed_data || {},
            transcript_url: transcript_data ? `data:text/plain;base64,${Buffer.from(transcript_data).toString('base64')}` : null,
            performance_score: analyzed_data?.performance_score || null,
            strengths: analyzed_data?.strengths || [],
            weaknesses: analyzed_data?.weaknesses || [],
            recommendations: analyzed_data?.recommendations || [],
            key_topics_covered: analyzed_data?.key_topics_covered || [],
            objections_handled: analyzed_data?.objections_handled || [],
            customer_sentiment: analyzed_data?.customer_sentiment || null,
            script_compliance: analyzed_data?.script_compliance || null
          });

          logger.info(`Sales call ${salesCallId} updated with OtterAI analysis data`);
        }
      } catch (updateError) {
        logger.error(`Error updating sales call ${salesCallId}:`, updateError);
        // Don't fail the entire request if sales call update fails
      }
    }

    // Create analytics record if we have analyzed data
    if (analyzed_data && organizationId) {
      try {
        const { Analytics } = getModels();
        
        await Analytics.create({
          organization_id: organizationId,
          user_id: userId,
          report_type: 'otterai_analysis',
          report_name: `OtterAI Analysis - ${salesCallId || 'General'}`,
          report_data: {
            transcript_data,
            analyzed_data,
            captured_data,
            sales_call_id: salesCallId
          },
          filters: {},
          date_range: {
            start: new Date().toISOString(),
            end: new Date().toISOString()
          },
          generated_at: new Date(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          is_scheduled: false
        });

        logger.info(`Analytics record created for OtterAI analysis`);
      } catch (analyticsError) {
        logger.error('Error creating analytics record:', analyticsError);
        // Don't fail the entire request if analytics creation fails
      }
    }

    // Send notification if we have a user ID
    if (userId && organizationId) {
      try {
        const { Notification } = getModels();
        
        await Notification.create({
          organization_id: organizationId,
          user_id: userId,
          type: 'otterai_analysis_complete',
          title: 'OtterAI Analysis Complete',
          message: 'Your sales call has been analyzed by OtterAI. Check the analytics dashboard for insights.',
          priority: 'medium',
          data: {
            salesCallId,
            hasTranscript: !!transcript_data,
            hasAnalysis: !!analyzed_data
          }
        });

        logger.info(`Notification sent for OtterAI analysis completion`);
      } catch (notificationError) {
        logger.error('Error sending notification:', notificationError);
        // Don't fail the entire request if notification fails
      }
    }

    res.status(200).json({
      success: true,
      message: 'OtterAI analysis data processed successfully',
      data: {
        processedAt: new Date().toISOString(),
        salesCallId,
        organizationId,
        userId,
        dataReceived: {
          transcript: !!transcript_data,
          analyzed: !!analyzed_data,
          captured: !!captured_data
        }
      }
    });

  } catch (error) {
    logger.error('Error processing OtterAI analysis data:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to process OtterAI analysis data',
        code: 'PROCESSING_FAILED',
        details: error.message
      }
    });
  }
});

/**
 * @route   GET /api/v1/zapier/test/otterai
 * @desc    Test endpoint for OtterAI to verify connection
 * @access  Public
 */
router.get('/test/otterai', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'OtterAI connection test successful',
    timestamp: new Date().toISOString(),
    endpoint: '/api/v1/zapier/actions/otterai-analyze',
    method: 'POST',
    expectedData: {
      transcript_data: 'string (optional)',
      analyzed_data: 'object (optional)',
      captured_data: 'object (optional)',
      salesCallId: 'UUID (optional)',
      organizationId: 'UUID (optional)',
      userId: 'UUID (optional)'
    }
  });
});

module.exports = router;
