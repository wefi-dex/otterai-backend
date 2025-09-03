const { logger } = require('../utils/logger');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    organizationId: req.user?.organizationId
  });

  // Sequelize validation error
  if (err.name === 'SequelizeValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = {
      message: `Validation Error: ${message}`,
      statusCode: 400,
      code: 'VALIDATION_ERROR'
    };
  }

  // Sequelize unique constraint error
  if (err.name === 'SequelizeUniqueConstraintError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = {
      message: `Duplicate Error: ${message}`,
      statusCode: 400,
      code: 'DUPLICATE_ERROR'
    };
  }

  // Sequelize foreign key constraint error
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    error = {
      message: 'Referenced record does not exist',
      statusCode: 400,
      code: 'FOREIGN_KEY_ERROR'
    };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = {
      message: 'Invalid token',
      statusCode: 401,
      code: 'TOKEN_INVALID'
    };
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      message: 'Token expired',
      statusCode: 401,
      code: 'TOKEN_EXPIRED'
    };
  }

  // Axios errors (API calls)
  if (err.isAxiosError) {
    error = {
      message: err.response?.data?.message || 'External API error',
      statusCode: err.response?.status || 500,
      code: 'EXTERNAL_API_ERROR'
    };
  }

  // Custom application errors
  if (err.code) {
    error = {
      message: err.message,
      statusCode: err.statusCode || 500,
      code: err.code
    };
  }

  // Default error
  if (!error.statusCode) {
    error = {
      message: error.message || 'Server Error',
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR'
    };
  }

  // Send error response
  res.status(error.statusCode).json({
    success: false,
    error: {
      message: error.message,
      code: error.code,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};

module.exports = { errorHandler };
