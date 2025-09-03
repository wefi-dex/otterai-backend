#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class DatabaseMigrator {
  constructor() {
    this.client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'otterai_sales_analytics',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    this.migrationsPath = path.join(__dirname, 'migrations');
  }

  async connect() {
    try {
      await this.client.connect();
      console.log('✅ Connected to PostgreSQL database');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      await this.client.end();
      console.log('✅ Disconnected from database');
    } catch (error) {
      console.error('❌ Error disconnecting:', error.message);
    }
  }

  async checkMigrationsTable() {
    try {
      const result = await this.client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'migrations'
        );
      `);
      
      if (!result.rows[0].exists) {
        console.log('📋 Creating migrations table...');
        await this.client.query(`
          CREATE TABLE migrations (
            id SERIAL PRIMARY KEY,
            migration_name VARCHAR(255) NOT NULL,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(20) DEFAULT 'success'
          );
        `);
        console.log('✅ Migrations table created');
      }
    } catch (error) {
      console.error('❌ Error checking migrations table:', error.message);
      throw error;
    }
  }

  async getExecutedMigrations() {
    try {
      const result = await this.client.query('SELECT migration_name FROM migrations WHERE status = $1', ['success']);
      return result.rows.map(row => row.migration_name);
    } catch (error) {
      console.error('❌ Error getting executed migrations:', error.message);
      return [];
    }
  }

  async getMigrationFiles() {
    try {
      const files = fs.readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.sql') && !file.includes('rollback'))
        .sort();
      
      return files;
    } catch (error) {
      console.error('❌ Error reading migration files:', error.message);
      return [];
    }
  }

  async runMigration(migrationFile) {
    const migrationName = path.basename(migrationFile, '.sql');
    
    try {
      console.log(`\n🔄 Running migration: ${migrationName}`);
      
      // Check if migration already executed
      const result = await this.client.query(
        'SELECT id FROM migrations WHERE migration_name = $1 AND status = $2',
        [migrationName, 'success']
      );
      
      if (result.rows.length > 0) {
        console.log(`⏭️  Migration ${migrationName} already executed, skipping...`);
        return;
      }

      // Read and execute migration file
      const migrationPath = path.join(this.migrationsPath, migrationFile);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      await this.client.query('BEGIN');
      await this.client.query(migrationSQL);
      await this.client.query('COMMIT');
      
      // Record successful migration
      await this.client.query(
        'INSERT INTO migrations (migration_name, status) VALUES ($1, $2)',
        [migrationName, 'success']
      );
      
      console.log(`✅ Migration ${migrationName} completed successfully`);
      
    } catch (error) {
      await this.client.query('ROLLBACK');
      
      // Record failed migration
      try {
        await this.client.query(
          'INSERT INTO migrations (migration_name, status) VALUES ($1, $2)',
          [migrationName, 'failed']
        );
      } catch (insertError) {
        console.error('❌ Error recording failed migration:', insertError.message);
      }
      
      console.error(`❌ Migration ${migrationName} failed:`, error.message);
      throw error;
    }
  }

  async runRollback(migrationName) {
    try {
      console.log(`\n🔄 Rolling back migration: ${migrationName}`);
      
      // Check if migration was executed
      const result = await this.client.query(
        'SELECT id FROM migrations WHERE migration_name = $1 AND status = $1',
        [migrationName, 'success']
      );
      
      if (result.rows.length === 0) {
        console.log(`⚠️  Migration ${migrationName} not found or not executed successfully`);
        return;
      }

      // Read and execute rollback file
      const rollbackFile = `${migrationName}_rollback.sql`;
      const rollbackPath = path.join(this.migrationsPath, rollbackFile);
      
      if (!fs.existsSync(rollbackPath)) {
        console.log(`⚠️  Rollback file not found: ${rollbackFile}`);
        return;
      }
      
      const rollbackSQL = fs.readFileSync(rollbackPath, 'utf8');
      
      await this.client.query('BEGIN');
      await this.client.query(rollbackSQL);
      await this.client.query('COMMIT');
      
      // Remove migration record
      await this.client.query('DELETE FROM migrations WHERE migration_name = $1', [migrationName]);
      
      console.log(`✅ Rollback ${migrationName} completed successfully`);
      
    } catch (error) {
      await this.client.query('ROLLBACK');
      console.error(`❌ Rollback ${migrationName} failed:`, error.message);
      throw error;
    }
  }

  async migrate() {
    try {
      await this.connect();
      await this.checkMigrationsTable();
      
      const executedMigrations = await this.getExecutedMigrations();
      const migrationFiles = await this.getMigrationFiles();
      
      console.log(`\n📋 Found ${migrationFiles.length} migration files`);
      console.log(`📋 Already executed: ${executedMigrations.length} migrations`);
      
      if (migrationFiles.length === 0) {
        console.log('⚠️  No migration files found');
        return;
      }
      
      for (const migrationFile of migrationFiles) {
        await this.runMigration(migrationFile);
      }
      
      console.log('\n🎉 All migrations completed successfully!');
      
    } catch (error) {
      console.error('\n❌ Migration failed:', error.message);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }

  async rollback(migrationName) {
    try {
      await this.connect();
      await this.runRollback(migrationName);
      console.log('\n🎉 Rollback completed successfully!');
    } catch (error) {
      console.error('\n❌ Rollback failed:', error.message);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }

  async status() {
    try {
      await this.connect();
      await this.checkMigrationsTable();
      
      const result = await this.client.query(`
        SELECT migration_name, executed_at, status 
        FROM migrations 
        ORDER BY executed_at DESC
      `);
      
      console.log('\n📋 Migration Status:');
      console.log('===================');
      
      if (result.rows.length === 0) {
        console.log('No migrations executed yet');
      } else {
        result.rows.forEach(row => {
          const status = row.status === 'success' ? '✅' : '❌';
          console.log(`${status} ${row.migration_name} - ${row.executed_at} (${row.status})`);
        });
      }
      
    } catch (error) {
      console.error('❌ Error getting migration status:', error.message);
    } finally {
      await this.disconnect();
    }
  }
}

// CLI interface
async function main() {
  const migrator = new DatabaseMigrator();
  const command = process.argv[2];
  const migrationName = process.argv[3];
  
  switch (command) {
    case 'migrate':
      await migrator.migrate();
      break;
      
    case 'rollback':
      if (!migrationName) {
        console.error('❌ Please specify migration name: npm run migrate:rollback <migration_name>');
        process.exit(1);
      }
      await migrator.rollback(migrationName);
      break;
      
    case 'status':
      await migrator.status();
      break;
      
    default:
      console.log(`
🚀 OtterAI Database Migration Tool

Usage:
  npm run migrate          - Run all pending migrations
  npm run migrate:rollback <name> - Rollback specific migration
  npm run migrate:status  - Show migration status

Examples:
  npm run migrate
  npm run migrate:rollback 001_initial_schema
  npm run migrate:status
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

module.exports = DatabaseMigrator;
