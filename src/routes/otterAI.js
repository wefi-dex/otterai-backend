const express = require('express');
const { body, validationResult } = require('express-validator');
const otterAIService = require('../services/otterAIService');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * @route   POST /api/v1/otterai/start-recording
 * @desc    Start a new OtterAI recording session
 * @access  Private (Sales Representatives, Managers, Admins)
 */
router.post('/start-recording', [
  authenticateToken,
  requireRole(['sales_representative', 'sales_manager', 'admin', 'super_admin']),
  body('salesCallId').isUUID().withMessage('Valid sales call ID is required'),
  body('options').optional().isObject().withMessage('Options must be an object')
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

    const { salesCallId, options = {} } = req.body;
    const organizationId = req.user.organizationId;

    const result = await otterAIService.startRecording(salesCallId, organizationId, options);

    logger.logOtterAIEvent('recording_started', result.recordingId, {
      salesCallId,
      organizationId,
      userId: req.user.id
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error starting recording:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to start recording',
        code: 'RECORDING_START_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/otterai/stop-recording
 * @desc    Stop an active OtterAI recording
 * @access  Private (Sales Representatives, Managers, Admins)
 */
router.post('/stop-recording', [
  authenticateToken,
  requireRole(['sales_representative', 'sales_manager', 'admin', 'super_admin']),
  body('recordingId').notEmpty().withMessage('Recording ID is required')
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

    const { recordingId } = req.body;

    const result = await otterAIService.stopRecording(recordingId);

    logger.logOtterAIEvent('recording_stopped', recordingId, {
      userId: req.user.id
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error stopping recording:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to stop recording',
        code: 'RECORDING_STOP_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/otterai/recording/:recordingId
 * @desc    Get recording details and transcript
 * @access  Private (Sales Representatives, Managers, Admins)
 */
router.get('/recording/:recordingId', [
  authenticateToken,
  requireRole(['sales_representative', 'sales_manager', 'admin', 'super_admin'])
], async (req, res) => {
  try {
    const { recordingId } = req.params;

    const result = await otterAIService.getRecordingDetails(recordingId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting recording details:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get recording details',
        code: 'RECORDING_DETAILS_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/otterai/analyze/:salesCallId
 * @desc    Analyze a sales call against training scripts
 * @access  Private (Sales Representatives, Managers, Admins)
 */
router.post('/analyze/:salesCallId', [
  authenticateToken,
  requireRole(['sales_representative', 'sales_manager', 'admin', 'super_admin'])
], async (req, res) => {
  try {
    const { salesCallId } = req.params;
    const { recordingId } = req.body;

    if (!recordingId) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Recording ID is required',
          code: 'RECORDING_ID_REQUIRED'
        }
      });
    }

    const result = await otterAIService.analyzeSalesCall(salesCallId, recordingId);

    logger.logOtterAIEvent('analysis_completed', recordingId, {
      salesCallId,
      userId: req.user.id
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error analyzing sales call:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to analyze sales call',
        code: 'ANALYSIS_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/otterai/webhook
 * @desc    Handle webhook events from OtterAI
 * @access  Public (OtterAI webhook)
 */
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-otter-signature'];
    const payload = req.body;

    if (!signature) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Missing webhook signature',
          code: 'MISSING_SIGNATURE'
        }
      });
    }

    const result = await otterAIService.handleWebhook(payload, signature);

    logger.logOtterAIEvent('webhook_received', payload.recording_id, {
      eventType: payload.event_type,
      signature: signature.substring(0, 10) + '...'
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error('Error handling webhook:', error);
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
 * @route   GET /api/v1/otterai/status
 * @desc    Get OtterAI service status
 * @access  Private (All authenticated users)
 */
router.get('/status', [
  authenticateToken
], async (req, res) => {
  try {
    // Check if OtterAI API key is configured
    const isConfigured = !!process.env.OTTERAI_API_KEY;
    
    res.status(200).json({
      success: true,
      data: {
        configured: isConfigured,
        apiUrl: process.env.OTTERAI_API_URL || 'https://api.otter.ai',
        webhookConfigured: !!process.env.OTTERAI_WEBHOOK_SECRET
      }
    });
  } catch (error) {
    logger.error('Error getting OtterAI status:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get service status',
        code: 'STATUS_CHECK_FAILED'
      }
    });
  }
});

module.exports = router;
