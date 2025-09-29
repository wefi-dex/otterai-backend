const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const { logger } = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { notFoundHandler } = require('./middleware/notFoundHandler');
const { initializeDatabase, closeDatabase } = require('./database/connection');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const organizationRoutes = require('./routes/organizations');
const salesCallRoutes = require('./routes/salesCalls');
const otterAIRoutes = require('./routes/otterAI');
const analyticsRoutes = require('./routes/analytics');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const zapierRoutes = require('./routes/zapier');
const fileRoutes = require('./routes/files');
// Import Socket.IO handlers
const { initializeSocketIO } = require('./socket/socketHandler');

const app = express();
const server = createServer(app);

// Trust proxy configuration (required for correct client IPs behind reverse proxies like nginx)
// Avoid boolean `true` which is considered permissive and breaks express-rate-limit safety checks.
// Configure via env TRUST_PROXY (examples):
// - TRUST_PROXY=1                        → trust first proxy (e.g., nginx)
// - TRUST_PROXY=2                        → trust two proxies (e.g., Cloudflare → nginx)
// - TRUST_PROXY=loopback                 → trust only loopback addresses
// - TRUST_PROXY="loopback,linklocal,uniquelocal" → trust common private ranges
(() => {
  const raw = process.env.TRUST_PROXY || '1';
  let setting;

  if (/^\d+$/.test(raw)) {
    setting = parseInt(raw, 10);
  } else if (raw.includes(',')) {
    setting = raw.split(',').map(s => s.trim());
  } else if (['loopback', 'linklocal', 'uniquelocal'].includes(raw)) {
    setting = raw;
  } else if (raw === 'true') {
    // Prevent permissive setting; default safely to 1 instead
    setting = 1;
  } else {
    // Fallback to trusting first proxy
    setting = 1;
  }

  app.set('trust proxy', setting);
})();

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: false // Set to false when using wildcard origin
  }
});
// Initialize Socket.IO handlers
initializeSocketIO(io);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration - Allow all origins
app.use(cors({
  origin: "*", // Allow all origins
  credentials: false, // Set to false when using wildcard origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Speed limiting
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per 15 minutes, then...
  delayMs: (used, req) => {
    const delayAfter = req.slowDown.limit;
    return (used - delayAfter) * 500;
  }
});

app.use(limiter);
app.use(speedLimiter);

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// API routes
const apiVersion = process.env.API_VERSION || 'v1';
const apiPrefix = `/api/${apiVersion}`;

// Public routes (no authentication required)
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/otterai`, otterAIRoutes);
app.use(`${apiPrefix}/zapier`, zapierRoutes);

// Protected routes (authentication required)
app.use(`${apiPrefix}/users`, userRoutes);
app.use(`${apiPrefix}/organizations`, organizationRoutes);
app.use(`${apiPrefix}/sales-calls`, salesCallRoutes);
app.use(`${apiPrefix}/analytics`, analyticsRoutes);
app.use(`${apiPrefix}/notifications`, notificationRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);

// File storage routes (authentication required)
app.use(`${apiPrefix}/files`, fileRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize database and start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialize database first
    await initializeDatabase();

    // Start server
    server.listen(PORT, () => {
      logger.info(`🚀 OtterAI Sales Analytics Backend Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  try {
    await closeDatabase();
    server.close(() => {
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  try {
    await closeDatabase();
    server.close(() => {
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught Exception:', error);
  try {
    await closeDatabase();
  } catch (closeError) {
    logger.error('Error closing database:', closeError);
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  try {
    await closeDatabase();
  } catch (closeError) {
    logger.error('Error closing database:', closeError);
  }
  process.exit(1);
});


// Start the server and handle any errors
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

module.exports = { app, server, io };
