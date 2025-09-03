-- =====================================================
-- OtterAI Sales Analytics - Initial Database Migration Rollback
-- Migration: 001_initial_schema_rollback
-- Description: Rolls back all initial tables for the system
-- Date: 2024
-- =====================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS update_files_updated_at ON files;
DROP TRIGGER IF EXISTS update_live_sessions_updated_at ON live_sessions;
DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
DROP TRIGGER IF EXISTS update_analytics_updated_at ON analytics;
DROP TRIGGER IF EXISTS update_sales_scripts_updated_at ON sales_scripts;
DROP TRIGGER IF EXISTS update_sales_calls_updated_at ON sales_calls;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables in reverse order (due to foreign key constraints)
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS live_sessions CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS analytics CASCADE;
DROP TABLE IF EXISTS sales_scripts CASCADE;
DROP TABLE IF EXISTS sales_calls CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- Drop migrations table
DROP TABLE IF EXISTS migrations CASCADE;

-- Log successful rollback
DO $$
BEGIN
    RAISE NOTICE 'Rollback 001_initial_schema completed successfully!';
    RAISE NOTICE 'Dropped all tables, indexes, constraints, and triggers';
END $$;
