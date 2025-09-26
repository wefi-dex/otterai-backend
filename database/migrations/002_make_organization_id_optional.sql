-- =====================================================
-- OtterAI Sales Analytics - Migration 002
-- Description: Make organization_id optional in users table
-- Date: 2024
-- =====================================================

-- First, drop the existing foreign key constraint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_organization'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT fk_users_organization;
    END IF;
END $$;

-- Make organization_id nullable
ALTER TABLE users ALTER COLUMN organization_id DROP NOT NULL;

-- Re-add the foreign key constraint with SET NULL on delete
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_organization'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_organization 
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Insert migration record
INSERT INTO migrations (migration_name, status) VALUES ('002_make_organization_id_optional', 'success');

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 002_make_organization_id_optional completed successfully!';
    RAISE NOTICE 'Made organization_id optional in users table';
END $$;
