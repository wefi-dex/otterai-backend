const sgMail = require('@sendgrid/mail');
const { logger } = require('../utils/logger');

class EmailService {
  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY;
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@otterai.com';
    this.fromName = process.env.SENDGRID_FROM_NAME || 'OtterAI Sales Analytics';
    
    if (this.apiKey) {
      sgMail.setApiKey(this.apiKey);
      logger.info('SendGrid email service initialized');
    } else {
      logger.warn('SendGrid API key not found. Email service will not work.');
    }
  }

  /**d
   * Send a simple text email
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} text - Plain text content
   * @param {string} html - HTML content (optional)
   * @returns {Promise<Object>} SendGrid response
   */
  async sendEmail(to, subject, text, html = null) {
    if (!this.apiKey) {
      throw new Error('SendGrid API key not configured');
    }

    try {
      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject,
        text,
        ...(html && { html })
      };

      const response = await sgMail.send(msg);
      logger.info(`Email sent successfully to ${to}: ${subject}`);
      return response;
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Send a welcome email to new users
   * @param {string} to - Recipient email address
   * @param {string} firstName - User's first name
   * @param {string} organizationName - Organization name
   * @returns {Promise<Object>} SendGrid response
   */
  async sendWelcomeEmail(to, firstName, organizationName) {
    const subject = 'Welcome to OtterAI Sales Analytics!';
    const text = `Hi ${firstName},\n\nWelcome to OtterAI Sales Analytics! You've been added to ${organizationName}.\n\nGet started by logging into your dashboard and exploring the features.\n\nBest regards,\nThe OtterAI Team`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to OtterAI Sales Analytics!</h2>
        <p>Hi ${firstName},</p>
        <p>Welcome to OtterAI Sales Analytics! You've been added to <strong>${organizationName}</strong>.</p>
        <p>Get started by logging into your dashboard and exploring the features.</p>
        <br>
        <p>Best regards,<br>The OtterAI Team</p>
      </div>
    `;

    return this.sendEmail(to, subject, text, html);
  }

  /**
   * Send a password reset email
   * @param {string} to - Recipient email address
   * @param {string} firstName - User's first name
   * @param {string} resetToken - Password reset token
   * @param {string} resetUrl - Password reset URL
   * @returns {Promise<Object>} SendGrid response
   */
  async sendPasswordResetEmail(to, firstName, resetToken, resetUrl) {
    const subject = 'Password Reset Request - OtterAI Sales Analytics';
    const text = `Hi ${firstName},\n\nYou requested a password reset for your OtterAI Sales Analytics account.\n\nClick the following link to reset your password:\n${resetUrl}?token=${resetToken}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this reset, please ignore this email.\n\nBest regards,\nThe OtterAI Team`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Password Reset Request</h2>
        <p>Hi ${firstName},</p>
        <p>You requested a password reset for your OtterAI Sales Analytics account.</p>
        <p>Click the following button to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}?token=${resetToken}" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p><small>This link will expire in 1 hour.</small></p>
        <p>If you didn't request this reset, please ignore this email.</p>
        <br>
        <p>Best regards,<br>The OtterAI Team</p>
      </div>
    `;

    return this.sendEmail(to, subject, text, html);
  }

  /**
   * Send a sales call notification email
   * @param {string} to - Recipient email address
   * @param {string} firstName - User's first name
   * @param {Object} salesCall - Sales call data
   * @returns {Promise<Object>} SendGrid response
   */
  async sendSalesCallNotification(to, firstName, salesCall) {
    const subject = `New Sales Call: ${salesCall.customerName || 'Customer'}`;
    const text = `Hi ${firstName},\n\nA new sales call has been recorded:\n\nCustomer: ${salesCall.customerName || 'N/A'}\nDuration: ${salesCall.duration || 'N/A'} minutes\nDate: ${new Date(salesCall.createdAt).toLocaleDateString()}\n\nLog into your dashboard to review the call details and analytics.\n\nBest regards,\nThe OtterAI Team`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New Sales Call Recorded</h2>
        <p>Hi ${firstName},</p>
        <p>A new sales call has been recorded:</p>
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0;">
          <p><strong>Customer:</strong> ${salesCall.customerName || 'N/A'}</p>
          <p><strong>Duration:</strong> ${salesCall.duration || 'N/A'} minutes</p>
          <p><strong>Date:</strong> ${new Date(salesCall.createdAt).toLocaleDateString()}</p>
        </div>
        <p>Log into your dashboard to review the call details and analytics.</p>
        <br>
        <p>Best regards,<br>The OtterAI Team</p>
      </div>
    `;

    return this.sendEmail(to, subject, text, html);
  }

  /**
   * Send an analytics report email
   * @param {string} to - Recipient email address
   * @param {string} firstName - User's first name
   * @param {Object} reportData - Analytics report data
   * @returns {Promise<Object>} SendGrid response
   */
  async sendAnalyticsReport(to, firstName, reportData) {
    const subject = 'Your OtterAI Sales Analytics Report';
    const text = `Hi ${firstName},\n\nHere's your latest sales analytics report:\n\nTotal Calls: ${reportData.totalCalls || 0}\nTotal Duration: ${reportData.totalDuration || 0} minutes\nConversion Rate: ${reportData.conversionRate || 0}%\n\nLog into your dashboard for detailed insights.\n\nBest regards,\nThe OtterAI Team`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Your Sales Analytics Report</h2>
        <p>Hi ${firstName},</p>
        <p>Here's your latest sales analytics report:</p>
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0;">
          <p><strong>Total Calls:</strong> ${reportData.totalCalls || 0}</p>
          <p><strong>Total Duration:</strong> ${reportData.totalDuration || 0} minutes</p>
          <p><strong>Conversion Rate:</strong> ${reportData.conversionRate || 0}%</p>
        </div>
        <p>Log into your dashboard for detailed insights.</p>
        <br>
        <p>Best regards,<br>The OtterAI Team</p>
      </div>
    `;

    return this.sendEmail(to, subject, text, html);
  }

  /**
   * Send a notification email
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} message - Notification message
   * @returns {Promise<Object>} SendGrid response
   */
  async sendNotificationEmail(to, subject, message) {
    const text = `${message}\n\nLog into your OtterAI dashboard for more details.\n\nBest regards,\nThe OtterAI Team`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>${message}</p>
        <p>Log into your <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}">OtterAI dashboard</a> for more details.</p>
        <br>
        <p>Best regards,<br>The OtterAI Team</p>
      </div>
    `;

    return this.sendEmail(to, subject, text, html);
  }

  /**
   * Send a bulk email to multiple recipients
   * @param {Array<string>} to - Array of recipient email addresses
   * @param {string} subject - Email subject
   * @param {string} text - Plain text content
   * @param {string} html - HTML content (optional)
   * @returns {Promise<Array>} Array of SendGrid responses
   */
  async sendBulkEmail(to, subject, text, html = null) {
    if (!this.apiKey) {
      throw new Error('SendGrid API key not configured');
    }

    try {
      const messages = to.map(email => ({
        to: email,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject,
        text,
        ...(html && { html })
      }));

      const response = await sgMail.sendMultiple(messages);
      logger.info(`Bulk email sent successfully to ${to.length} recipients: ${subject}`);
      return response;
    } catch (error) {
      logger.error(`Failed to send bulk email to ${to.length} recipients:`, error);
      throw error;
    }
  }

  /**
   * Check if email service is properly configured
   * @returns {boolean} True if configured, false otherwise
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Get email service status
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      provider: 'SendGrid',
      fromEmail: this.fromEmail,
      fromName: this.fromName
    };
  }
}

// Create and export a singleton instance
const emailService = new EmailService();

module.exports = emailService;
