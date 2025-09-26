const express = require('express');
const { body, validationResult } = require('express-validator');
const { getSequelize } = require('../database/connection');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const emailService = require('../services/emailService');

const router = express.Router();

// Get models from sequelize instance
const getModels = () => {
  try {
    const sequelize = getSequelize();
    return {
      Notification: sequelize.models.Notification,
      User: sequelize.models.User
    };
  } catch (error) {
    logger.error('Failed to get models:', error);
    throw new Error('Database not initialized');
  }
};

/**
 * @route   GET /api/v1/notifications
 * @desc    Get user notifications
 * @access  Private (All authenticated users)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { Notification } = getModels();
    const { page = 1, limit = 20, status, type } = req.query;
    const userId = req.user.id;

    const whereClause = { user_id: userId };
    if (status === 'unread') whereClause.is_read = false;
    if (status === 'read') whereClause.is_read = true;
    if (type) whereClause.type = type;

    const notifications = await Notification.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: {
        notifications: notifications.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: notifications.count,
          pages: Math.ceil(notifications.count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch notifications',
        code: 'NOTIFICATIONS_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/notifications/unread
 * @desc    Get unread notifications count
 * @access  Private (All authenticated users)
 */
router.get('/unread', authenticateToken, async (req, res) => {
  try {
    const { Notification } = getModels();
    const userId = req.user.id;

    const unreadCount = await Notification.count({
      where: {
        user_id: userId,
        is_read: false
      }
    });

    res.status(200).json({
      success: true,
      data: {
        unreadCount
      }
    });
  } catch (error) {
    logger.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch unread count',
        code: 'UNREAD_COUNT_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   PUT /api/v1/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private (All authenticated users)
 */
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { Notification } = getModels();
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: { id, user_id: userId }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Notification not found',
          code: 'NOTIFICATION_NOT_FOUND'
        }
      });
    }

    await notification.markAsRead();

    res.status(200).json({
      success: true,
      data: notification
    });
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to mark notification as read',
        code: 'NOTIFICATION_READ_FAILED'
      }
    });
  }
});

/**
 * @route   PUT /api/v1/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private (All authenticated users)
 */
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const { Notification } = getModels();
    const userId = req.user.id;

    await Notification.update(
      {
        status: 'read',
        read_at: new Date()
      },
      {
        where: {
          user_id: userId,
          status: 'unread'
        }
      }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to mark all notifications as read',
        code: 'NOTIFICATIONS_READ_ALL_FAILED'
      }
    });
  }
});

/**
 * @route   DELETE /api/v1/notifications/:id
 * @desc    Delete notification
 * @access  Private (All authenticated users)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { Notification } = getModels();
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: { id, user_id: userId }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Notification not found',
          code: 'NOTIFICATION_NOT_FOUND'
        }
      });
    }

    await notification.destroy();

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete notification',
        code: 'NOTIFICATION_DELETE_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/notifications
 * @desc    Create notification (for managers/admins)
 * @access  Private (Managers, Admins)
 */
router.post('/', [
  authenticateToken,
  requireRole(['sales_manager', 'admin', 'super_admin']),
  body('userId').isUUID().withMessage('Valid user ID is required'),
  body('type').isIn(['call_started', 'call_completed', 'performance_alert', 'live_intervention', 'system_alert', 'reminder', 'achievement', 'coaching_tip']).withMessage('Valid notification type is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('message').notEmpty().withMessage('Message is required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Valid priority is required')
], async (req, res) => {
  try {
    const { Notification, User } = getModels();
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
      userId,
      type,
      title,
      message,
      priority = 'medium',
      actionUrl,
      actionData,
      relatedEntityType,
      relatedEntityId
    } = req.body;

    const organization_id = req.user.organization_id;

    // Verify user belongs to the same organization
    const targetUser = await User.findOne({
      where: { id: userId, organization_id }
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Create notification
    const notification = await Notification.create({
      organization_id,
      user_id: userId,
      type,
      title,
      message,
      priority,
      actionUrl,
      actionData,
      relatedEntityType,
      relatedEntityId
    });

    logger.logUserActivity(req.user.id, 'notification_created', {
      targetUserId: userId,
      type,
      title
    });

    res.status(201).json({
      success: true,
      data: notification
    });
  } catch (error) {
    logger.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create notification',
        code: 'NOTIFICATION_CREATE_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/notifications/organization
 * @desc    Get organization notifications (for managers/admins)
 * @access  Private (Managers, Admins)
 */
router.get('/organization', [
  authenticateToken,
  requireRole(['sales_manager', 'admin', 'super_admin'])
], async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const organization_id = req.user.organization_id;

    const whereClause = { organization_id };
    if (type) whereClause.type = type;
    if (status) whereClause.status = status;

    const notifications = await Notification.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: {
        notifications: notifications.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: notifications.count,
          pages: Math.ceil(notifications.count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching organization notifications:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch organization notifications',
        code: 'ORGANIZATION_NOTIFICATIONS_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/notifications/send-email
 * @desc    Send email notification to user
 * @access  Private (Managers, Admins)
 */
router.post('/send-email', [
  authenticateToken,
  requireRole(['sales_manager', 'admin', 'super_admin']),
  body('userId').isUUID().withMessage('Valid user ID is required'),
  body('subject').notEmpty().withMessage('Subject is required'),
  body('message').notEmpty().withMessage('Message is required')
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

    const { userId, subject, message } = req.body;
    const organization_id = req.user.organization_id;

    // Find user
    const user = await User.findOne({
      where: { 
        id: userId, 
        organization_id 
      },
      attributes: ['id', 'first_name', 'last_name', 'email']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Send email notification
    try {
      await emailService.sendNotificationEmail(user.email, subject, message);
      
      // Create notification record
      const notification = await Notification.create({
        organization_id,
        user_id: userId,
        type: 'email',
        title: subject,
        message,
        priority: 'normal',
        status: 'sent'
      });

      logger.logUserActivity(req.user.id, 'email_notification_sent', {
        targetUserId: userId,
        subject,
        email: user.email
      });

      res.status(200).json({
        success: true,
        message: 'Email notification sent successfully',
        data: {
          notification,
          emailSent: true
        }
      });
    } catch (emailError) {
      logger.error('Failed to send email notification:', emailError);
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to send email notification',
          code: 'EMAIL_SEND_FAILED',
          details: emailError.message
        }
      });
    }
  } catch (error) {
    logger.error('Error sending email notification:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to send email notification',
        code: 'EMAIL_NOTIFICATION_FAILED'
      }
    });
  }
});

module.exports = router;
