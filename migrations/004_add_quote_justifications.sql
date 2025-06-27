-- Migration: Add quote justification field
-- Date: 2025-01-27  
-- Description: Adds single justification field to consolidate all quote context and reasoning

-- Add justification field to quotes table
ALTER TABLE public.quotes 
ADD COLUMN IF NOT EXISTS relevance_justification TEXT;

-- Update existing quotes with default values
UPDATE public.quotes 
SET relevance_justification = 'Quote imported from legacy system - context not available'
WHERE relevance_justification IS NULL;

-- Comments for documentation
COMMENT ON COLUMN public.quotes.relevance_justification IS 'Comprehensive explanation of why this quote is relevant, including extraction context and selection reasoning';