const express = require('express');
const { body, validationResult } = require('express-validator');
const { getSequelize } = require('../database/connection');
const { requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// =============================================
// Utility function to save input body data to special file
// =============================================
const saveInputDataToFile = (endpoint, data) => {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    const inputDataDir = path.join(logsDir, 'input-data');
    
    // Ensure input-data directory exists
    if (!fs.existsSync(inputDataDir)) {
      fs.mkdirSync(inputDataDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${endpoint}-${timestamp}.json`;
    const filepath = path.join(inputDataDir, filename);
    
    const inputData = {
      timestamp: new Date().toISOString(),
      endpoint: endpoint,
      data: data
    };
    
    fs.writeFileSync(filepath, JSON.stringify(inputData, null, 2));
    logger.info(`Input data saved to file: ${filename}`);
    
    return filepath;
  } catch (error) {
    logger.error('Failed to save input data to file:', error);
    return null;
  }
};

// =============================================
// Cloud Storage Upload (commented out for now)
// When ready, uncomment the lines below and ensure axios is installed
// const axios = require('axios');
// const fileStorageService = require('../services/fileStorageService');
//
// async function downloadFileAsBuffer(url) {
//   const response = await axios.get(url, { responseType: 'arraybuffer' });
//   const contentType = response.headers['content-type'] || 'application/octet-stream';
//   return { buffer: Buffer.from(response.data), contentType };
// }
//
// function buildObjectKey(prefix, extension = 'dat', salesCallId) {
//   const safePrefix = prefix || 'uploads';
//   const base = salesCallId ? `${salesCallId}` : 'general';
//   const timestamp = Date.now();
//   return `${safePrefix}/${base}-${timestamp}.${extension}`;
// }
// =============================================

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
  // Save input body data to special file
  saveInputDataToFile('sales-call-completed', req.body);
  
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
  // Save input body data to special file
  saveInputDataToFile('performance-alert', req.body);
  
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
  body('sentiment_analysis').optional().isObject().withMessage('Sentiment analysis must be an object'),
  body('user_identification').optional().isObject().withMessage('User identification must be an object'),
  body('meeting_id').optional().isString().withMessage('Meeting ID must be a string')

], async (req, res) => {
  // Save input body data to special file
  console.log("req=============>", req.body)
  saveInputDataToFile('otterai-analyze', req.body);
  
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
      transcript, // Updated: transcript is now the URL
      captured_data_url, // Updated: captured_data_url is the recording URL
      sentiment_analysis,
      user_identification,
      user_info, // Add user_info parsing
      meeting_id,
      meeting_details, // Add meeting_details parsing
      salesCallId, 
      organizationId
    } = req.body;

    // Helper function to format calendar guests
    const formatCalendarGuests = (guests) => {
      if (Array.isArray(guests)) {
        return guests.join(', ');
      }
      return guests || '';
    };

    // =============================================================
    // Optional: Persist remote transcript/captured files to cloud storage
    // Uncomment to enable saving the remote files we received as URLs
    // let uploadedTranscriptUrl = null;
    // let uploadedCapturedDataUrl = null;
    // try {
    //   if (transcript_data) {
    //     const { buffer, contentType } = await downloadFileAsBuffer(transcript_data);
    //     // Attempt to infer extension from content type
    //     const ext = contentType.includes('json') ? 'json' : contentType.includes('plain') ? 'txt' : 'dat';
    //     const objectKey = buildObjectKey('otterai/transcripts', ext, salesCallId);
    //     const result = await fileStorageService.uploadFile(buffer, objectKey, contentType, 'analytics');
    //     uploadedTranscriptUrl = `${fileStorageService.baseUrl}/${fileStorageService.bucket}/${result.fileKey}`;
    //   }
    //   if (captured_data) {
    //     const { buffer, contentType } = await downloadFileAsBuffer(captured_data);
    //     const ext = contentType.includes('json') ? 'json' : 'dat';
    //     const objectKey = buildObjectKey('otterai/captured', ext, salesCallId);
    //     const result = await fileStorageService.uploadFile(buffer, objectKey, contentType, 'analytics');
    //     uploadedCapturedDataUrl = `${fileStorageService.baseUrl}/${fileStorageService.bucket}/${result.fileKey}`;
    //   }
    // } catch (cloudError) {
    //   logger.error('Cloud storage upload failed:', cloudError);
    // }
    // =============================================================

    // Log the OtterAI data received
    logger.logZapierEvent('otterai_analyze', {
      salesCallId,
      organizationId,
      meeting_id,
      hasTranscript: !!transcript,
      hasSentimentAnalysis: !!sentiment_analysis,
      hasUserIdentification: !!user_identification,
      hasUserInfo: !!user_info,
      hasMeetingDetails: !!meeting_details,
      transcriptLength: transcript ? transcript.length : 0
    });

    // Handle sales call - either update existing or create new one
    let createdSalesCallId = null;
    try {
      const { SalesCall } = getModels();
      
      // Prepare analysis data from sentiment analysis
        const analysisData = {
          meeting_id,
          sentiment_analysis,
          user_identification,
          user_info: {
            ...user_info,
            calendar_guests_formatted: formatCalendarGuests(user_info?.calendar_guests)
          },
          meeting_details,
          transcript: transcript || null,
          captured_data_url: captured_data_url || null
        };

      // Extract performance metrics from sentiment analysis
      const performanceScore = sentiment_analysis?.meeting_score ? 
        Math.min(parseFloat(sentiment_analysis.meeting_score), 9.99) : null; // Cap at 9.99 for database precision
      
      const strengths = sentiment_analysis?.strengths ? 
        sentiment_analysis.strengths.split(',').map(s => s.trim()).filter(s => s) : [];
      
      const weaknesses = sentiment_analysis?.weaknesses ? 
        sentiment_analysis.weaknesses.split(',').map(s => s.trim()).filter(s => s) : [];

      // Calculate duration from meeting details
      let duration = null;
      if (meeting_details?.duration) {
        const durationStr = meeting_details.duration.toString();
        
        if (durationStr.includes(':')) {
          // Format: "00:45:30" or "45:30"
          const parts = durationStr.split(':');
          if (parts.length === 3) {
            const hours = parseInt(parts[0]) || 0;
            const minutes = parseInt(parts[1]) || 0;
            const seconds = parseInt(parts[2]) || 0;
            duration = (hours * 3600) + (minutes * 60) + seconds;
          } else if (parts.length === 2) {
            const minutes = parseInt(parts[0]) || 0;
            const seconds = parseInt(parts[1]) || 0;
            duration = (minutes * 60) + seconds;
          }
        } else if (durationStr.includes('m')) {
          // Format: "45m" or "1h 30m"
          const match = durationStr.match(/(?:(\d+)h\s*)?(?:(\d+)m)?/);
          if (match) {
            const hours = parseInt(match[1]) || 0;
            const minutes = parseInt(match[2]) || 0;
            duration = (hours * 3600) + (minutes * 60);
          }
        } else if (durationStr.includes('h')) {
          // Format: "1h" or "1.5h"
          const hours = parseFloat(durationStr.replace('h', ''));
          duration = Math.round(hours * 3600);
        } else {
          // If it's already a number, use it directly
          duration = parseInt(durationStr) || null;
        }
      }

      if (salesCallId) {
        // Update existing sales call
        const salesCall = await SalesCall.findByPk(salesCallId);
        if (salesCall) {
          // Map sentiment category to valid values for updates too
          let mappedSentiment = null;
          if (sentiment_analysis?.sentiment_category) {
            const sentiment = sentiment_analysis.sentiment_category.toLowerCase();
            if (sentiment.includes('positive') || sentiment.includes('impressive') || sentiment.includes('good')) {
              mappedSentiment = 'positive';
            } else if (sentiment.includes('negative') || sentiment.includes('bad') || sentiment.includes('ugly')) {
              mappedSentiment = 'negative';
            } else {
              mappedSentiment = 'neutral';
            }
          }

          await salesCall.update({
            analysis_data: analysisData,
            transcript_url: transcript || salesCall.transcript_url, // Use new URL if provided, keep existing if not
            performance_score: performanceScore,
            strengths: strengths,
            weaknesses: weaknesses,
            recommendations: [], // Can be populated from additional analysis
            key_topics_covered: [], // Can be extracted from transcript analysis
            objections_handled: [], // Can be extracted from transcript analysis
            customer_sentiment: mappedSentiment,
            script_compliance: null, // Can be calculated from transcript analysis
            // Update meeting timing fields
            call_start_time: meeting_details?.start_datetime ? new Date(meeting_details.start_datetime) : salesCall.call_start_time,
            call_end_time: meeting_details?.end_datetime ? new Date(meeting_details.end_datetime) : salesCall.call_end_time,
            duration: duration || salesCall.duration, // Update duration if provided
            // Update recording fields
            otter_ai_recording_id: meeting_id || salesCall.otter_ai_recording_id,
            recording_url: captured_data_url || salesCall.recording_url, // Use new URL if provided, keep existing if not
            // Set outcome to null as it's hidden
            outcome: null
          });

          logger.info(`Sales call ${salesCallId} updated with OtterAI analysis data`);
          createdSalesCallId = salesCallId;
        }
      } else {
        // Create new sales call record - no userId required
          // Map sentiment category to valid values
          let mappedSentiment = null;
          if (sentiment_analysis?.sentiment_category) {
            const sentiment = sentiment_analysis.sentiment_category.toLowerCase();
            if (sentiment.includes('positive') || sentiment.includes('impressive') || sentiment.includes('good')) {
              mappedSentiment = 'positive';
            } else if (sentiment.includes('negative') || sentiment.includes('bad') || sentiment.includes('ugly')) {
              mappedSentiment = 'negative';
            } else {
              mappedSentiment = 'neutral';
            }
          }

          const salesCallData = {
            organization_id: organizationId || null, // Allow null organization_id
            sales_representative_id: null, // No userId available from Zapier
            customer_name: user_info?.user_name || user_identification?.user_name || 'Unknown Customer',
            customer_email: user_info?.user_email || user_identification?.user_email || null,
            appointment_date: meeting_details?.start_datetime ? new Date(meeting_details.start_datetime) : new Date(), // Use meeting start time if available
            call_start_time: meeting_details?.start_datetime ? new Date(meeting_details.start_datetime) : null,
            call_end_time: meeting_details?.end_datetime ? new Date(meeting_details.end_datetime) : null,
            status: 'completed', // Always completed when coming from OtterAI
            outcome: null, // Hidden field - not needed
            analysis_data: analysisData,
            transcript_url: transcript || null, // transcript is now the URL
            performance_score: performanceScore,
            strengths: strengths,
            weaknesses: weaknesses,
            recommendations: [], // Can be populated from additional analysis
            key_topics_covered: [], // Can be extracted from transcript analysis
            objections_handled: [], // Can be extracted from transcript analysis
            customer_sentiment: mappedSentiment,
            script_compliance: null, // Can be calculated from transcript analysis
            // Add duration calculation from meeting details
            duration: duration, // Calculated from meeting_details.duration
            // Add recording fields
            otter_ai_recording_id: meeting_id || null,
            recording_url: captured_data_url || null, // captured_data_url is the recording URL
            // Remove sale_amount as it's not needed
            sale_amount: null
          };

          const newSalesCall = await SalesCall.create(salesCallData);
          createdSalesCallId = newSalesCall.id;
          
          logger.info(`New sales call ${createdSalesCallId} created with OtterAI analysis data (org: ${organizationId || 'none'})`);
      }
    } catch (salesCallError) {
      logger.error(`Error handling sales call:`, salesCallError);
      // Don't fail the entire request if sales call handling fails
    }

    // Create analytics record if we have sentiment analysis data (optional - for reporting)
    if (sentiment_analysis && (createdSalesCallId || salesCallId)) {
      try {
        const { Analytics, Organization } = getModels();

        // Ensure organization exists before referencing it, otherwise set null to avoid FK violation
        let analyticsOrganizationId = organizationId || null;
        if (organizationId) {
          try {
            const org = await Organization.findByPk(organizationId);
            if (!org) {
              logger.warn(`Analytics create: organization ${organizationId} not found; setting organization_id to null to avoid FK violation`);
              analyticsOrganizationId = null;
            }
          } catch (orgLookupError) {
            logger.warn('Analytics create: organization lookup failed; setting organization_id to null', { error: String(orgLookupError) });
            analyticsOrganizationId = null;
          }
        }

        await Analytics.create({
          organization_id: analyticsOrganizationId, // Allow null for external webhooks
          user_id: null, // No userId available from Zapier
          report_type: 'otterai_analysis',
          report_name: `OtterAI Analysis - ${createdSalesCallId || salesCallId || meeting_id || 'General'}`,
          report_data: {
            transcript: transcript || null,
            captured_data_url: captured_data_url || null,
            sentiment_analysis,
            user_identification,
            user_info,
            meeting_details,
            meeting_id,
            sales_call_id: createdSalesCallId || salesCallId,
            analysis_timestamp: new Date().toISOString()
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

        logger.info(`Analytics record created for OtterAI analysis (linked to sales call: ${createdSalesCallId || salesCallId})`);
      } catch (analyticsError) {
        logger.error('Error creating analytics record:', analyticsError);
        // Don't fail the entire request if analytics creation fails
      }
    }

    // Skip notification creation for now due to validation issues
    // TODO: Fix notification validation and re-enable
    logger.info(`Skipping notification creation due to validation constraints`);

    res.status(200).json({
      success: true,
      message: createdSalesCallId ? 
        'Sales call record created successfully with OtterAI analysis data' : 
        'OtterAI analysis data processed successfully',
      data: {
        processedAt: new Date().toISOString(),
        salesCallId: createdSalesCallId || salesCallId,
        organizationId,
        meeting_id,
        salesCallCreated: !!createdSalesCallId,
        dataReceived: {
          transcript: !!transcript,
          capturedDataUrl: !!captured_data_url,
          sentimentAnalysis: !!sentiment_analysis,
          userIdentification: !!user_identification,
          userInfo: !!user_info,
          meetingDetails: !!meeting_details,
          transcriptLength: transcript ? transcript.length : 0
        },
        analysisSummary: {
          sentimentCategory: sentiment_analysis?.sentiment_category || null,
          meetingScore: sentiment_analysis?.meeting_score || null,
          hasStrengths: !!sentiment_analysis?.strengths,
          hasWeaknesses: !!sentiment_analysis?.weaknesses
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
    description: 'Creates sales call records from OtterAI interview analysis data with updated structure',
      expectedData: {
        transcript: 'string (optional) - URL to transcript file',
        captured_data_url: 'string (optional) - URL to recording file',
        sentiment_analysis: 'object (optional) - Contains sentiment_category, strengths, weaknesses, meeting_score',
        user_identification: 'object (optional) - Contains user_email, user_name, calendar_guests, meeting_id',
        user_info: 'object (optional) - Contains user_email, user_name, calendar_guests, meeting_id (alternative to user_identification)',
        meeting_details: 'object (optional) - Contains duration, start_datetime, end_datetime, created_at, summary, abstract_summary',
        meeting_id: 'string (optional) - OtterAI meeting identifier',
        salesCallId: 'UUID (optional) - Internal sales call ID (if updating existing)',
        organizationId: 'UUID (optional) - Organization ID (optional)'
      },
    behavior: {
      primary: 'Creates new sales call record if no salesCallId provided',
      secondary: 'Updates existing sales call if salesCallId provided',
      analytics: 'Creates analytics record linked to sales call',
      notifications: 'Sends notification to user about completed analysis'
    },
      salesCallStructure: {
        customer_name: 'From user_info.user_name or user_identification.user_name',
        customer_email: 'From user_info.user_email or user_identification.user_email',
        appointment_date: 'From meeting_details.start_datetime or current timestamp',
        call_start_time: 'From meeting_details.start_datetime',
        call_end_time: 'From meeting_details.end_datetime',
        status: 'Always set to "completed"',
        outcome: 'Set to null (hidden field)',
        sale_amount: 'Set to null (hidden field)',
        performance: 'From sentiment_analysis.sentiment_category',
        sales_rep: 'From user_info.calendar_guests or user_identification.calendar_guests (displayed in frontend)',
        duration: 'Calculated from meeting_details.duration (converted to seconds)',
        analysis_data: 'Contains full OtterAI analysis data including transcript, sentiment, and meeting details',
        otter_ai_recording_id: 'From meeting_id',
        recording_url: 'From captured_data_url parameter (saved to database)',
        transcript_url: 'From transcript parameter (saved to database)'
      }
  });
});

// Proxy endpoint to fetch transcript content (to avoid CORS issues)
router.get('/proxy/transcript', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL parameter is required'
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Fetch the content
    const response = await fetch(url);
    
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Failed to fetch content: ${response.status} ${response.statusText}`
      });
    }

    const content = await response.text();
    
    res.status(200).json({
      success: true,
      content: content,
      contentType: response.headers.get('content-type') || 'text/plain',
      contentLength: content.length
    });

  } catch (error) {
    logger.error('Error proxying transcript content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transcript content',
      details: error.message
    });
  }
});

module.exports = router;
