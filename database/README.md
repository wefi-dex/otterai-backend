# Database Setup and Migration Guide

This directory contains all the necessary files to set up and manage the OtterAI Sales Analytics database.

## 📁 File Structure

```
database/
├── migrations/                    # SQL migration files
│   ├── 001_initial_schema.sql    # Initial database schema
│   └── 001_initial_schema_rollback.sql  # Rollback script
├── run-migration.js              # Migration runner script
├── setup-database.js             # Database setup script
└── README.md                     # This file
```

## 🚀 Quick Start

### 1. Set Environment Variables

Create a `.env` file in your project root with database credentials:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=otterai_sales_analytics
DB_USER=postgres
DB_PASSWORD=your_password_here
DB_DIALECT=postgres
```

### 2. Setup Database

```bash
# Create database and run initial setup
npm run db:setup

# Or manually:
npm run db:create
npm run migrate
```

### 3. Run Migrations

```bash
# Run all pending migrations
npm run migrate

# Check migration status
npm run migrate:status

# Rollback specific migration
npm run migrate:rollback 001_initial_schema
```

## 📋 Available Commands

### Database Setup Commands

| Command | Description |
|---------|-------------|
| `npm run db:setup` | Create database and run setup |
| `npm run db:reset` | Drop and recreate database |
| `npm run db:create` | Create database only |
| `npm run db:drop` | Drop database only |
| `npm run db:test` | Test database connection |

### Migration Commands

| Command | Description |
|---------|-------------|
| `npm run migrate` | Run all pending migrations |
| `npm run migrate:status` | Show migration status |
| `npm run migrate:rollback <name>` | Rollback specific migration |

## 🗄️ Database Schema

The initial migration creates the following tables:

### Core Tables
- **organizations** - Company/organization information
- **users** - User accounts and profiles
- **sales_calls** - Sales call records and analytics
- **sales_scripts** - Sales scripts and templates
- **analytics** - Analytics reports and data
- **notifications** - User notifications
- **live_sessions** - Live monitoring sessions
- **files** - File storage references (IDrive E2 integration)

### Features
- **UUID Primary Keys** - Secure and scalable identifiers
- **JSONB Fields** - Flexible data storage for settings and metadata
- **Automatic Timestamps** - `created_at` and `updated_at` fields
- **Foreign Key Constraints** - Referential integrity
- **Performance Indexes** - Optimized for common queries
- **Soft Deletes** - File deletion tracking

## 🔄 Migration Process

### Running Migrations

1. **Check Status**: `npm run migrate:status`
2. **Run Migrations**: `npm run migrate`
3. **Verify**: Check logs for success messages

### Migration Files

- **Naming Convention**: `001_initial_schema.sql`
- **Rollback Files**: `001_initial_schema_rollback.sql`
- **Execution Order**: Numerically sorted by prefix

### Rollback Process

```bash
# Rollback specific migration
npm run migrate:rollback 001_initial_schema

# This will:
# 1. Execute the rollback SQL
# 2. Remove migration record
# 3. Log the process
```

## 🛠️ Development Workflow

### 1. Initial Setup
```bash
# First time setup
npm run db:setup
npm run migrate
npm run dev
```

### 2. Development Changes
```bash
# When making schema changes
# 1. Create new migration file
# 2. Test locally
# 3. Run migration
npm run migrate
```

### 3. Testing
```bash
# Test database connection
npm run db:test

# Check migration status
npm run migrate:status
```

### 4. Reset Development Database
```bash
# Complete reset (WARNING: destroys all data)
npm run db:reset
npm run migrate
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Connection Errors
```bash
# Check environment variables
echo $DB_PASSWORD

# Test connection
npm run db:test
```

#### 2. Migration Failures
```bash
# Check migration status
npm run migrate:status

# Check logs for specific errors
# Rollback if needed
npm run migrate:rollback <migration_name>
```

#### 3. Permission Errors
```bash
# Ensure PostgreSQL user has proper permissions
# Check if user can create databases
createdb test_db
dropdb test_db
```

### Debug Commands

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Connect to PostgreSQL
psql -U postgres -h localhost

# List databases
\l

# Connect to specific database
\c otterai_sales_analytics

# List tables
\dt

# Check table structure
\d table_name
```

## 📊 Database Monitoring

### Check Table Sizes
```sql
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY tablename, attname;
```

### Check Index Usage
```sql
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### Monitor Active Connections
```sql
SELECT 
    datname,
    usename,
    application_name,
    client_addr,
    state,
    query_start
FROM pg_stat_activity
WHERE datname = 'otterai_sales_analytics';
```

## 🚨 Production Considerations

### 1. Backup Strategy
```bash
# Create database backup
pg_dump -U postgres -h localhost otterai_sales_analytics > backup.sql

# Restore from backup
psql -U postgres -h localhost otterai_sales_analytics < backup.sql
```

### 2. Environment Variables
- Use strong passwords in production
- Enable SSL connections
- Set appropriate connection limits

### 3. Migration Safety
- Always backup before migrations
- Test migrations in staging environment
- Use transaction rollbacks for safety

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Node.js pg Driver](https://node-postgres.com/)
- [Database Migration Best Practices](https://martinfowler.com/articles/evodb.html)

## 🆘 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review PostgreSQL logs: `/var/log/postgresql/`
3. Check application logs in `./logs/` directory
4. Verify environment variables are set correctly

---

**Happy Database Management! 🎉**
