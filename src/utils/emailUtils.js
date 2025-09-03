const emailService = require('../services/emailService');
const { logger } = require('./logger');

/**
 * Send a welcome email to a new user
 * @param {Object} user - User object with email, firstName, lastName
 * @param {Object} organization - Organization object with name
 * @returns {Promise<boolean>} Success status
 */
async function sendWelcomeEmail(user, organization) {
  try {
    if (!emailService.isConfigured()) {
      logger.warn('Email service not configured, skipping welcome email');
      return false;
    }

    await emailService.sendWelcomeEmail(user.email, user.firstName, organization.name);
    logger.info(`Welcome email sent to ${user.email}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send welcome email to ${user.email}:`, error);
    return false;
  }
}

/**
 * Send a password reset email
 * @param {Object} user - User object with email, firstName
 * @param {string} resetToken - Password reset token
 * @param {string} resetUrl - Password reset URL
 * @returns {Promise<boolean>} Success status
 */
async function sendPasswordResetEmail(user, resetToken, resetUrl) {
  try {
    if (!emailService.isConfigured()) {
      logger.warn('Email service not configured, cannot send password reset email');
      return false;
    }

    await emailService.sendPasswordResetEmail(user.email, user.firstName, resetToken, resetUrl);
    logger.info(`Password reset email sent to ${user.email}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send password reset email to ${user.email}:`, error);
    return false;
  }
}

/**
 * Send a sales call notification email
 * @param {Object} user - User object with email, firstName
 * @param {Object} salesCall - Sales call object
 * @returns {Promise<boolean>} Success status
 */
async function sendSalesCallNotification(user, salesCall) {
  try {
    if (!emailService.isConfigured()) {
      logger.warn('Email service not configured, skipping sales call notification');
      return false;
    }

    await emailService.sendSalesCallNotification(user.email, user.firstName, salesCall);
    logger.info(`Sales call notification sent to ${user.email}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send sales call notification to ${user.email}:`, error);
    return false;
  }
}

/**
 * Send an analytics report email
 * @param {Object} user - User object with email, firstName
 * @param {Object} reportData - Analytics report data
 * @returns {Promise<boolean>} Success status
 */
async function sendAnalyticsReport(user, reportData) {
  try {
    if (!emailService.isConfigured()) {
      logger.warn('Email service not configured, skipping analytics report');
      return false;
    }

    await emailService.sendAnalyticsReport(user.email, user.firstName, reportData);
    logger.info(`Analytics report sent to ${user.email}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send analytics report to ${user.email}:`, error);
    return false;
  }
}

/**
 * Send a general notification email
 * @param {Object} user - User object with email, firstName
 * @param {string} subject - Email subject
 * @param {string} message - Notification message
 * @returns {Promise<boolean>} Success status
 */
async function sendNotificationEmail(user, subject, message) {
  try {
    if (!emailService.isConfigured()) {
      logger.warn('Email service not configured, skipping notification email');
      return false;
    }

    await emailService.sendNotificationEmail(user.email, subject, message);
    logger.info(`Notification email sent to ${user.email}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send notification email to ${user.email}:`, error);
    return false;
  }
}

/**
 * Send bulk notification emails to multiple users
 * @param {Array<Object>} users - Array of user objects with email, firstName
 * @param {string} subject - Email subject
 * @param {string} message - Notification message
 * @returns {Promise<Object>} Results summary
 */
async function sendBulkNotificationEmails(users, subject, message) {
  try {
    if (!emailService.isConfigured()) {
      logger.warn('Email service not configured, skipping bulk notifications');
      return {
        success: false,
        total: users.length,
        sent: 0,
        failed: 0,
        error: 'Email service not configured'
      };
    }

    const emails = users.map(user => user.email);
    await emailService.sendBulkEmail(emails, subject, message);
    
    logger.info(`Bulk notification emails sent to ${users.length} users`);
    return {
      success: true,
      total: users.length,
      sent: users.length,
      failed: 0
    };
  } catch (error) {
    logger.error(`Failed to send bulk notification emails:`, error);
    return {
      success: false,
      total: users.length,
      sent: 0,
      failed: users.length,
      error: error.message
    };
  }
}

/**
 * Check if email service is available
 * @returns {boolean} True if email service is configured and ready
 */
function isEmailServiceAvailable() {
  return emailService.isConfigured();
}

/**
 * Get email service status information
 * @returns {Object} Email service status
 */
function getEmailServiceStatus() {
  return emailService.getStatus();
}

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendSalesCallNotification,
  sendAnalyticsReport,
  sendNotificationEmail,
  sendBulkNotificationEmails,
  isEmailServiceAvailable,
  getEmailServiceStatus
};
