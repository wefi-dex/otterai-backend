const { Sequelize } = require('sequelize');
const { logger } = require('../utils/logger');

let sequelize;

const initializeDatabase = async () => {
  try {
    // Always use PostgreSQL (no more SQLite fallback)
    sequelize = new Sequelize(
      process.env.DB_NAME || 'otterai_sales_analytics',
      process.env.DB_USER || 'postgres',
      String(process.env.DB_PASSWORD),
      {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres', // Always PostgreSQL
        logging: false, // Disable all Sequelize logging
        pool: {
          max: 20,
          min: 0,
          acquire: 30000,
          idle: 10000
        },
        define: {
          timestamps: true,
          underscored: true,
        },
        // PostgreSQL specific options
        dialectOptions: {
          // Enable UUID extension support
          statement_timeout: 60000,
          idle_in_transaction_session_timeout: 60000,
        }
      }
    );

    // Test the connection
    await sequelize.authenticate();
    
    const defineUser = require('./models/User');
    const defineOrganization = require('./models/Organization');
    const defineSalesCall = require('./models/SalesCall');
    const defineSalesScript = require('./models/SalesScript');
    const defineAnalytics = require('./models/Analytics');
    const defineNotification = require('./models/Notification');
    const defineLiveSession = require('./models/LiveSession');
    const defineFiles = require('./models/Files');

    // Define models with sequelize instance
    defineUser(sequelize);
    defineOrganization(sequelize);
    defineSalesCall(sequelize);
    defineSalesScript(sequelize);
    defineAnalytics(sequelize);
    defineNotification(sequelize);
    defineLiveSession(sequelize);
    defineFiles(sequelize);

    // Set up model associations
    const { User, Organization, SalesCall, SalesScript, Analytics, Notification, LiveSession, Files } = sequelize.models;

    // Organization associations
    Organization.hasMany(User, {
      foreignKey: 'organization_id',
      as: 'users'
    });

    Organization.hasMany(SalesCall, {
      foreignKey: 'organization_id',
      as: 'salesCalls'
    });

    Organization.hasMany(SalesScript, {
      foreignKey: 'organization_id',
      as: 'salesScripts'
    });

    Organization.hasMany(Analytics, {
      foreignKey: 'organization_id',
      as: 'analytics'
    });

    Organization.hasMany(Notification, {
      foreignKey: 'organization_id',
      as: 'notifications'
    });

    Organization.hasMany(LiveSession, {
      foreignKey: 'organization_id',
      as: 'liveSessions'
    });

    // Self-referencing association for parent-child organizations
    Organization.belongsTo(Organization, {
      foreignKey: 'parent_organization_id',
      as: 'parentOrganization'
    });

    Organization.hasMany(Organization, {
      foreignKey: 'parent_organization_id',
      as: 'childOrganizations'
    });

    // User associations
    User.belongsTo(Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });

    User.hasMany(SalesCall, {
      foreignKey: 'sales_representative_id',
      as: 'salesCalls'
    });

    User.hasMany(SalesCall, {
      foreignKey: 'manager_id',
      as: 'managedSalesCalls'
    });

    User.hasMany(SalesScript, {
      foreignKey: 'created_by',
      as: 'createdScripts'
    });

    User.hasMany(Analytics, {
      foreignKey: 'user_id',
      as: 'analytics'
    });

    User.hasMany(Notification, {
      foreignKey: 'user_id',
      as: 'notifications'
    });

    User.hasMany(LiveSession, {
      foreignKey: 'user_id',
      as: 'userSessions'
    });

    // Self-referencing association for manager-subordinate relationships
    User.belongsTo(User, {
      foreignKey: 'manager_id',
      as: 'manager'
    });

    User.hasMany(User, {
      foreignKey: 'manager_id',
      as: 'subordinates'
    });

    // SalesCall associations
    SalesCall.belongsTo(Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });

    SalesCall.belongsTo(User, {
      foreignKey: 'sales_representative_id',
      as: 'salesRepresentative'
    });

    SalesCall.belongsTo(User, {
      foreignKey: 'manager_id',
      as: 'manager'
    });

    SalesCall.hasOne(LiveSession, {
      foreignKey: 'sales_call_id',
      as: 'liveSession'
    });

    // SalesScript associations
    SalesScript.belongsTo(Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });

    SalesScript.belongsTo(User, {
      foreignKey: 'created_by',
      as: 'creator'
    });

    // Analytics associations
    Analytics.belongsTo(Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });

    Analytics.belongsTo(User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    // Notification associations
    Notification.belongsTo(Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });

    Notification.belongsTo(User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    // LiveSession associations
    LiveSession.belongsTo(Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });

    LiveSession.belongsTo(SalesCall, {
      foreignKey: 'sales_call_id',
      as: 'salesCall'
    });

    LiveSession.belongsTo(User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    // Files associations
    Files.belongsTo(Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });

    Files.belongsTo(User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    // Clean up orphaned foreign keys before syncing constraints
    // This prevents FK creation failures when legacy rows reference missing parents
    async function cleanOrphanedForeignKeys() {
      try {
        // Nullify invalid organization_id references across tables
        await sequelize.query(`
          UPDATE analytics SET organization_id = NULL
          WHERE organization_id IS NOT NULL
            AND organization_id NOT IN (SELECT id FROM organizations);
        `);

        await sequelize.query(`
          UPDATE sales_calls SET organization_id = NULL
          WHERE organization_id IS NOT NULL
            AND organization_id NOT IN (SELECT id FROM organizations);
        `);

        await sequelize.query(`
          UPDATE notifications SET organization_id = NULL
          WHERE organization_id IS NOT NULL
            AND organization_id NOT IN (SELECT id FROM organizations);
        `);

        await sequelize.query(`
          UPDATE live_sessions SET organization_id = NULL
          WHERE organization_id IS NOT NULL
            AND organization_id NOT IN (SELECT id FROM organizations);
        `);

        await sequelize.query(`
          UPDATE files SET organization_id = NULL
          WHERE organization_id IS NOT NULL
            AND organization_id NOT IN (SELECT id FROM organizations);
        `);

        // Optional: Nullify invalid user references where applicable
        await sequelize.query(`
          UPDATE analytics SET user_id = NULL
          WHERE user_id IS NOT NULL
            AND user_id NOT IN (SELECT id FROM users);
        `);

        await sequelize.query(`
          UPDATE notifications SET user_id = NULL
          WHERE user_id IS NOT NULL
            AND user_id NOT IN (SELECT id FROM users);
        `);

        await sequelize.query(`
          UPDATE sales_calls SET sales_representative_id = NULL
          WHERE sales_representative_id IS NOT NULL
            AND sales_representative_id NOT IN (SELECT id FROM users);
        `);

        await sequelize.query(`
          UPDATE sales_calls SET manager_id = NULL
          WHERE manager_id IS NOT NULL
            AND manager_id NOT IN (SELECT id FROM users);
        `);

        await sequelize.query(`
          UPDATE live_sessions SET user_id = NULL
          WHERE user_id IS NOT NULL
            AND user_id NOT IN (SELECT id FROM users);
        `);

      } catch (cleanupError) {
        logger.warn('Foreign key cleanup encountered an issue:', cleanupError);
      }
    }

    await cleanOrphanedForeignKeys();

    // Sync all models with database
    // In production, you should use migrations instead of sync
    // For development, we'll use force: false to avoid conflicts
    const syncOptions = process.env.NODE_ENV === 'development' 
      ? { force: false, alter: false, logging: false } // Disable alter and logging to avoid conflicts
      : { force: false, logging: false }; // Never use force in production, disable logging
    
    await sequelize.sync(syncOptions);

    return sequelize;
  } catch (error) {
    logger.error('Unable to connect to the PostgreSQL database:', error);
    throw error;
  }
};

const getSequelize = () => {
  if (!sequelize) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return sequelize;
};

const closeDatabase = async () => {
  if (sequelize) {
    await sequelize.close();
  }
};

module.exports = {
  initializeDatabase,
  getSequelize,
  closeDatabase
};
