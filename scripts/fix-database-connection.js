#!/usr/bin/env node

/**
 * Database Connection Fix Script for Alma Linux
 * This script helps diagnose and fix common PostgreSQL connection issues
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class DatabaseConnectionFixer {
  constructor() {
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'otterai_sales_analytics',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };
  }

  async testConnection() {
    console.log('🔍 Testing database connection...');
    console.log(`Host: ${this.config.host}`);
    console.log(`Port: ${this.config.port}`);
    console.log(`Database: ${this.config.database}`);
    console.log(`User: ${this.config.user}`);
    console.log(`Password: ${this.config.password ? '[SET]' : '[NOT SET]'}`);
    console.log('');

    const client = new Client(this.config);
    
    try {
      await client.connect();
      console.log('✅ Database connection successful!');
      
      // Test basic query
      const result = await client.query('SELECT version()');
      console.log('✅ Database version:', result.rows[0].version.split(' ')[0]);
      
      // Test extensions
      const extensions = await client.query(`
        SELECT extname FROM pg_extension 
        WHERE extname IN ('uuid-ossp', 'pgcrypto')
      `);
      
      console.log('✅ Available extensions:', extensions.rows.map(r => r.extname).join(', '));
      
      await client.end();
      return true;
      
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      await this.diagnoseError(error);
      return false;
    }
  }

  async diagnoseError(error) {
    console.log('\n🔍 Diagnosing connection error...');
    
    if (error.message.includes('SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string')) {
      console.log('❌ Password Issue Detected:');
      console.log('   - The password is not a string or is undefined');
      console.log('   - Check your .env file for DB_PASSWORD');
      console.log('   - Make sure the password is properly quoted');
      console.log('');
      console.log('💡 Fix: Update your .env file:');
      console.log('   DB_PASSWORD="your_actual_password"');
      
    } else if (error.message.includes('no pg_hba.conf entry')) {
      console.log('❌ Authentication Issue Detected:');
      console.log('   - PostgreSQL is rejecting the connection');
      console.log('   - pg_hba.conf needs to be configured');
      console.log('');
      console.log('💡 Fix: Add this to /var/lib/pgsql/data/pg_hba.conf:');
      console.log('   local   otterai_sales_analytics    otterai_user    md5');
      console.log('   host    otterai_sales_analytics    otterai_user    127.0.0.1/32   md5');
      console.log('');
      console.log('   Then restart PostgreSQL: sudo systemctl restart postgresql');
      
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('❌ Connection Refused:');
      console.log('   - PostgreSQL service is not running');
      console.log('   - Wrong host or port');
      console.log('');
      console.log('💡 Fix: Start PostgreSQL service:');
      console.log('   sudo systemctl start postgresql');
      console.log('   sudo systemctl enable postgresql');
      
    } else if (error.message.includes('database "otterai_sales_analytics" does not exist')) {
      console.log('❌ Database Not Found:');
      console.log('   - The database does not exist');
      console.log('');
      console.log('💡 Fix: Create the database:');
      console.log('   sudo -u postgres createdb otterai_sales_analytics');
      
    } else if (error.message.includes('role "otterai_user" does not exist')) {
      console.log('❌ User Not Found:');
      console.log('   - The database user does not exist');
      console.log('');
      console.log('💡 Fix: Create the user:');
      console.log('   sudo -u postgres createuser otterai_user');
      console.log('   sudo -u postgres psql -c "ALTER USER otterai_user PASSWORD \'your_password\';"');
      
    } else {
      console.log('❌ Unknown Error:');
      console.log('   Error details:', error.message);
      console.log('');
      console.log('💡 General troubleshooting steps:');
      console.log('   1. Check PostgreSQL service: sudo systemctl status postgresql');
      console.log('   2. Check logs: sudo journalctl -u postgresql');
      console.log('   3. Verify .env file configuration');
      console.log('   4. Test connection manually: psql -h localhost -U otterai_user -d otterai_sales_analytics');
    }
  }

  async createDatabaseAndUser() {
    console.log('\n🔄 Creating database and user...');
    
    // Connect to default postgres database
    const adminClient = new Client({
      host: this.config.host,
      port: this.config.port,
      database: 'postgres',
      user: 'postgres',
      password: this.config.password,
      ssl: this.config.ssl
    });

    try {
      await adminClient.connect();
      console.log('✅ Connected to PostgreSQL as admin');

      // Create database
      try {
        await adminClient.query(`CREATE DATABASE "${this.config.database}"`);
        console.log(`✅ Database ${this.config.database} created`);
      } catch (error) {
        if (error.code === '42P04') {
          console.log(`⚠️  Database ${this.config.database} already exists`);
        } else {
          throw error;
        }
      }

      // Create user
      try {
        await adminClient.query(`CREATE USER "${this.config.user}" WITH PASSWORD $1`, [this.config.password]);
        console.log(`✅ User ${this.config.user} created`);
      } catch (error) {
        if (error.code === '42710') {
          console.log(`⚠️  User ${this.config.user} already exists`);
        } else {
          throw error;
        }
      }

      // Grant privileges
      await adminClient.query(`GRANT ALL PRIVILEGES ON DATABASE "${this.config.database}" TO "${this.config.user}"`);
      console.log(`✅ Privileges granted to ${this.config.user}`);

      await adminClient.end();

      // Connect to the new database to grant schema privileges
      const dbClient = new Client({
        ...this.config,
        database: this.config.database
      });

      await dbClient.connect();
      
      // Grant schema privileges
      await dbClient.query(`GRANT ALL ON SCHEMA public TO "${this.config.user}"`);
      await dbClient.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${this.config.user}"`);
      await dbClient.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${this.config.user}"`);
      
      // Enable extensions
      await dbClient.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
      await dbClient.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
      
      console.log('✅ Schema privileges granted and extensions enabled');
      
      await dbClient.end();
      
    } catch (error) {
      console.error('❌ Failed to create database and user:', error.message);
      throw error;
    }
  }

  async checkEnvironmentFile() {
    console.log('\n🔍 Checking .env file...');
    
    const envPath = path.join(__dirname, '..', '.env');
    
    if (!fs.existsSync(envPath)) {
      console.log('❌ .env file not found');
      console.log('💡 Create .env file from env.example');
      return false;
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Check for required variables
    const requiredVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
    const missingVars = [];

    for (const varName of requiredVars) {
      if (!envContent.includes(`${varName}=`)) {
        missingVars.push(varName);
      }
    }

    if (missingVars.length > 0) {
      console.log('❌ Missing environment variables:', missingVars.join(', '));
      return false;
    }

    // Check for placeholder values
    if (envContent.includes('your_password') || envContent.includes('your_secure_password')) {
      console.log('⚠️  .env file contains placeholder values');
      console.log('💡 Update with actual values');
      return false;
    }

    console.log('✅ .env file looks good');
    return true;
  }

  async runDiagnostics() {
    console.log('🚀 OtterAI Database Connection Diagnostics\n');
    
    // Check .env file
    const envOk = await this.checkEnvironmentFile();
    if (!envOk) {
      console.log('\n❌ Please fix .env file issues first');
      return;
    }

    // Test connection
    const connectionOk = await this.testConnection();
    
    if (!connectionOk) {
      console.log('\n🔄 Attempting to create database and user...');
      try {
        await this.createDatabaseAndUser();
        console.log('\n🔄 Testing connection again...');
        await this.testConnection();
      } catch (error) {
        console.error('❌ Failed to create database and user:', error.message);
      }
    }

    console.log('\n📋 Summary:');
    console.log('- Check the error messages above for specific fixes');
    console.log('- Ensure PostgreSQL service is running: sudo systemctl status postgresql');
    console.log('- Check PostgreSQL logs: sudo journalctl -u postgresql');
    console.log('- Verify pg_hba.conf configuration');
  }
}

// Run diagnostics
if (require.main === module) {
  const fixer = new DatabaseConnectionFixer();
  fixer.runDiagnostics().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = DatabaseConnectionFixer;

