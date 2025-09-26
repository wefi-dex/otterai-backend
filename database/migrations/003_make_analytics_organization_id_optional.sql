-- Migration: 003_make_analytics_organization_id_optional
-- Description: Makes organization_id nullable in the analytics table to support external webhooks

DO $$
BEGIN
    -- Alter the column to be nullable
    ALTER TABLE analytics ALTER COLUMN organization_id DROP NOT NULL;

    RAISE NOTICE 'Migration 003_make_analytics_organization_id_optional completed successfully!';
END $$;
