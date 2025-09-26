-- Migration: 006_make_sales_representative_id_optional
-- Description: Alters the sales_calls table to make sales_representative_id nullable for external webhooks.

DO $$
BEGIN
    -- Drop the existing foreign key constraint if it exists
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'sales_calls_sales_representative_id_fkey'
    ) THEN
        ALTER TABLE sales_calls DROP CONSTRAINT sales_calls_sales_representative_id_fkey;
    END IF;

    -- Alter the column to be nullable
    ALTER TABLE sales_calls ALTER COLUMN sales_representative_id DROP NOT NULL;

    -- Add the foreign key constraint back with ON DELETE SET NULL
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'sales_calls_sales_representative_id_fkey'
    ) THEN
        ALTER TABLE sales_calls ADD CONSTRAINT sales_calls_sales_representative_id_fkey
            FOREIGN KEY (sales_representative_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    RAISE NOTICE 'Migration 006_make_sales_representative_id_optional completed successfully!';
END $$;
