-- Migration: 005_make_notifications_organization_id_optional
-- Description: Alters the notifications table to make organization_id nullable.

DO $$
BEGIN
    -- Drop the existing foreign key constraint if it exists
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_notifications_organization'
    ) THEN
        ALTER TABLE notifications DROP CONSTRAINT fk_notifications_organization;
    END IF;

    -- Alter the column to be nullable
    ALTER TABLE notifications ALTER COLUMN organization_id DROP NOT NULL;

    -- Add the foreign key constraint back with ON DELETE SET NULL
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_notifications_organization'
    ) THEN
        ALTER TABLE notifications ADD CONSTRAINT fk_notifications_organization
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
    END IF;

    RAISE NOTICE 'Migration 005_make_notifications_organization_id_optional completed successfully!';
END $$;
