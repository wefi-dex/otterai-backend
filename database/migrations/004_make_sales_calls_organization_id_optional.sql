-- Migration: 004_make_sales_calls_organization_id_optional
-- Description: Alters the sales_calls table to make organization_id nullable.

DO $$
BEGIN
    -- Drop the existing foreign key constraint if it exists
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_sales_calls_organization'
    ) THEN
        ALTER TABLE sales_calls DROP CONSTRAINT fk_sales_calls_organization;
    END IF;

    -- Alter the column to be nullable
    ALTER TABLE sales_calls ALTER COLUMN organization_id DROP NOT NULL;

    -- Add the foreign key constraint back with ON DELETE SET NULL
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_sales_calls_organization'
    ) THEN
        ALTER TABLE sales_calls ADD CONSTRAINT fk_sales_calls_organization
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
    END IF;

    RAISE NOTICE 'Migration 004_make_sales_calls_organization_id_optional completed successfully!';
END $$;
