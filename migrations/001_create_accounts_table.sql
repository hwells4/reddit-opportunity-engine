-- Migration: Create accounts table for user account management
-- Date: 2025-01-23
-- Description: Adds accounts table to track customer/demo accounts and associates runs with accounts

-- Create accounts table
CREATE TABLE IF NOT EXISTS public.accounts (
  account_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  website_url TEXT,
  company_description TEXT,
  industry TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  
  -- Ensure email uniqueness for active accounts
  CONSTRAINT unique_active_email UNIQUE(email) WHERE is_active = true
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_company_name ON public.accounts(company_name);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON public.accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON public.accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON public.accounts(created_at DESC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_accounts_updated_at 
  BEFORE UPDATE ON public.accounts 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add account_id column to runs table
ALTER TABLE public.runs 
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(account_id) ON DELETE CASCADE;

-- Create index for runs.account_id
CREATE INDEX IF NOT EXISTS idx_runs_account_id ON public.runs(account_id);

-- Create a default "Demo Account" for existing runs
INSERT INTO public.accounts (
  account_id,
  company_name, 
  contact_name, 
  email, 
  website_url,
  company_description,
  industry
) VALUES (
  '00000000-0000-0000-0000-000000000001'::UUID,
  'Demo Account',
  'System Administrator', 
  'demo@reddit-opportunity-engine.com',
  'https://reddit-opportunity-engine.com',
  'Default account for existing runs and testing',
  'Technology'
) ON CONFLICT (account_id) DO NOTHING;

-- Update existing runs to use demo account
UPDATE public.runs 
SET account_id = '00000000-0000-0000-0000-000000000001'::UUID 
WHERE account_id IS NULL;

-- Make account_id required for future runs
ALTER TABLE public.runs 
ALTER COLUMN account_id SET NOT NULL;

-- Row Level Security (RLS) setup for future use
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Basic policy - allow all operations for now (will be refined with authentication)
CREATE POLICY "Enable all operations for accounts" ON public.accounts
  FOR ALL USING (true) WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE public.accounts IS 'Customer/demo accounts for tracking usage and personalization';
COMMENT ON COLUMN public.accounts.account_id IS 'Primary key for account identification';
COMMENT ON COLUMN public.accounts.company_name IS 'Company or organization name';
COMMENT ON COLUMN public.accounts.contact_name IS 'Primary contact person name';
COMMENT ON COLUMN public.accounts.email IS 'Contact email address (unique per active account)';
COMMENT ON COLUMN public.accounts.website_url IS 'Company website URL';
COMMENT ON COLUMN public.accounts.company_description IS 'Brief company description for AI context';
COMMENT ON COLUMN public.accounts.industry IS 'Industry classification';
COMMENT ON COLUMN public.accounts.is_active IS 'Whether account is currently active';