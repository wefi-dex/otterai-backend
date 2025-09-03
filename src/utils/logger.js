const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'otterai-sales-analytics',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // File transport for error logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add request logging middleware
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// Helper methods for structured logging
logger.logAPIRequest = (req, res, responseTime) => {
  logger.info('API Request', {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id,
    organizationId: req.user?.organizationId
  });
};

logger.logAPIError = (req, error, responseTime) => {
  logger.error('API Error', {
    method: req.method,
    url: req.url,
    error: error.message,
    stack: error.stack,
    responseTime: responseTime ? `${responseTime}ms` : undefined,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id,
    organizationId: req.user?.organizationId
  });
};

logger.logSalesCallEvent = (event, salesCallId, data = {}) => {
  logger.info('Sales Call Event', {
    event,
    salesCallId,
    ...data
  });
};

logger.logOtterAIEvent = (event, recordingId, data = {}) => {
  logger.info('OtterAI Event', {
    event,
    recordingId,
    ...data
  });
};

logger.logZapierEvent = (event, data = {}) => {
  logger.info('Zapier Event', {
    event,
    ...data
  });
};

logger.logLiveSessionEvent = (event, sessionId, data = {}) => {
  logger.info('Live Session Event', {
    event,
    sessionId,
    ...data
  });
};

logger.logUserActivity = (userId, activity, data = {}) => {
  logger.info('User Activity', {
    userId,
    activity,
    ...data
  });
};

logger.logSecurityEvent = (event, userId, data = {}) => {
  logger.warn('Security Event', {
    event,
    userId,
    ...data
  });
};

logger.logPerformanceMetric = (metric, value, data = {}) => {
  logger.info('Performance Metric', {
    metric,
    value,
    ...data
  });
};

module.exports = { logger };
