-- Fix database constraints for Zapier integration

-- Make sales_representative_id nullable in sales_calls table
ALTER TABLE sales_calls ALTER COLUMN sales_representative_id DROP NOT NULL;

-- Make user_id nullable in notifications table  
ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL;

-- Update foreign key constraints to allow null values
ALTER TABLE sales_calls DROP CONSTRAINT IF EXISTS sales_calls_sales_representative_id_fkey;
ALTER TABLE sales_calls ADD CONSTRAINT sales_calls_sales_representative_id_fkey 
    FOREIGN KEY (sales_representative_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Verify the changes
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'sales_calls' AND column_name = 'sales_representative_id';

SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'notifications' AND column_name = 'user_id';
