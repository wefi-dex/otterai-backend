// This file is now just a placeholder since models are loaded dynamically
// in the database connection file after the sequelize instance is created


// Export empty objects - models will be loaded dynamically
module.exports = {
  User: null,
  Organization: null,
  SalesCall: null,
  SalesScript: null,
  Analytics: null,
  Notification: null,
  LiveSession: null,
  Files: null,
  get sequelize() {
    const { getSequelize } = require('../connection');
    return getSequelize();
  }
};
