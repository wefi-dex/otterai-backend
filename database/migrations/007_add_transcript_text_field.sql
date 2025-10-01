-- Migration: Add transcript_text field to sales_calls table
-- This field will store the actual transcript content as text
-- while transcript_url will continue to store URLs to transcript files

ALTER TABLE sales_calls 
ADD COLUMN transcript_text TEXT;

-- Add comment to clarify the purpose
COMMENT ON COLUMN sales_calls.transcript_text IS 'Stores the actual transcript content as text. transcript_url stores URLs to transcript files.';

-- Create index for better performance when searching transcript content
CREATE INDEX idx_sales_calls_transcript_text ON sales_calls USING gin(to_tsvector('english', transcript_text));
