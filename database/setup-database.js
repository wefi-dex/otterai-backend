#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class DatabaseSetup {
  constructor() {
    // Connect to default postgres database for setup
    this.client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: 'postgres', // Connect to default database first
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    this.targetDatabase = process.env.DB_NAME || 'otterai_sales_analytics';
  }

  async connect() {
    try {
      await this.client.connect();
      console.log('✅ Connected to PostgreSQL');
    } catch (error) {
      console.error('❌ Failed to connect to PostgreSQL:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      await this.client.end();
      console.log('✅ Disconnected from PostgreSQL');
    } catch (error) {
      console.error('❌ Error disconnecting:', error.message);
    }
  }

  async checkDatabaseExists() {
    try {
      const result = await this.client.query(`
        SELECT 1 FROM pg_database WHERE datname = $1
      `, [this.targetDatabase]);
      
      return result.rows.length > 0;
    } catch (error) {
      console.error('❌ Error checking database existence:', error.message);
      return false;
    }
  }

  async createDatabase() {
    try {
      console.log(`🔄 Creating database: ${this.targetDatabase}`);
      
      // Close all connections to the database if it exists
      await this.client.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [this.targetDatabase]);
      
      await this.client.query(`CREATE DATABASE "${this.targetDatabase}"`);
      console.log(`✅ Database ${this.targetDatabase} created successfully`);
      
    } catch (error) {
      if (error.code === '42P04') {
        console.log(`⚠️  Database ${this.targetDatabase} already exists`);
      } else {
        console.error('❌ Error creating database:', error.message);
        throw error;
      }
    }
  }

  async dropDatabase() {
    try {
      console.log(`🔄 Dropping database: ${this.targetDatabase}`);
      
      // Close all connections to the database
      await this.client.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [this.targetDatabase]);
      
      await this.client.query(`DROP DATABASE IF EXISTS "${this.targetDatabase}"`);
      console.log(`✅ Database ${this.targetDatabase} dropped successfully`);
      
    } catch (error) {
      console.error('❌ Error dropping database:', error.message);
      throw error;
    }
  }

  async testConnection() {
    try {
      console.log(`🔄 Testing connection to ${this.targetDatabase}...`);
      
      // Close current connection
      await this.client.end();
      
      // Create new connection to target database
      const testClient = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: this.targetDatabase,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      
      await testClient.connect();
      console.log(`✅ Successfully connected to ${this.targetDatabase}`);
      
      // Test basic query
      const result = await testClient.query('SELECT version()');
      console.log('✅ Database version:', result.rows[0].version.split(' ')[0]);
      
      await testClient.end();
      
    } catch (error) {
      console.error(`❌ Failed to connect to ${this.targetDatabase}:`, error.message);
      throw error;
    }
  }

  async setup() {
    try {
      console.log('🚀 Setting up OtterAI Sales Analytics Database...\n');
      
      await this.connect();
      
      const exists = await this.checkDatabaseExists();
      if (exists) {
        console.log(`📋 Database ${this.targetDatabase} already exists`);
      } else {
        await this.createDatabase();
      }
      
      await this.disconnect();
      
      // Test connection to new database
      await this.testConnection();
      
      console.log('\n🎉 Database setup completed successfully!');
      console.log('\n📋 Next steps:');
      console.log('1. Run migrations: npm run migrate');
      console.log('2. Check migration status: npm run migrate:status');
      console.log('3. Start the server: npm run dev');
      
    } catch (error) {
      console.error('\n❌ Database setup failed:', error.message);
      process.exit(1);
    }
  }

  async reset() {
    try {
      console.log('🔄 Resetting OtterAI Sales Analytics Database...\n');
      
      await this.connect();
      await this.dropDatabase();
      await this.createDatabase();
      await this.disconnect();
      
      console.log('\n🎉 Database reset completed successfully!');
      console.log('\n📋 Next steps:');
      console.log('1. Run migrations: npm run migrate');
      console.log('2. Check migration status: npm run migrate:status');
      
    } catch (error) {
      console.error('\n❌ Database reset failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI interface
async function main() {
  const setup = new DatabaseSetup();
  const command = process.argv[2];
  
  switch (command) {
    case 'setup':
      await setup.setup();
      break;
      
    case 'reset':
      await setup.reset();
      break;
      
    case 'create':
      await setup.connect();
      await setup.createDatabase();
      await setup.disconnect();
      break;
      
    case 'drop':
      await setup.connect();
      await setup.dropDatabase();
      await setup.disconnect();
      break;
      
    case 'test':
      await setup.testConnection();
      break;
      
    default:
      console.log(`
🚀 OtterAI Database Setup Tool

Usage:
  npm run db:setup     - Create database and run setup
  npm run db:reset     - Drop and recreate database
  npm run db:create    - Create database only
  npm run db:drop      - Drop database only
  npm run db:test      - Test database connection

Examples:
  npm run db:setup
  npm run db:reset
  npm run db:test

Environment Variables:
  DB_HOST          - Database host (default: localhost)
  DB_PORT          - Database port (default: 5432)
  DB_NAME          - Database name (default: otterai_sales_analytics)
  DB_USER          - Database user (default: postgres)
  DB_PASSWORD      - Database password (required)
      `);
      break;
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the CLI
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = DatabaseSetup;
