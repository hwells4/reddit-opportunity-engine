-- Create gumloop_workflows table for managing saved workflow URLs
CREATE TABLE gumloop_workflows (
  workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name TEXT NOT NULL,
  workflow_url TEXT NOT NULL,
  description TEXT,
  user_id TEXT,
  saved_item_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_gumloop_workflows_name ON gumloop_workflows(workflow_name);
CREATE INDEX idx_gumloop_workflows_active ON gumloop_workflows(is_active);

-- Add some example workflows
INSERT INTO gumloop_workflows (workflow_name, workflow_url, description, user_id, saved_item_id) VALUES
('Production v1', 'https://api.gumloop.com/api/v1/start_pipeline?user_id=EZUCg1VIYohJJgKgwDTrTyH2sC32&saved_item_id=2VJar3Dimtp46XZzXAzhEZ', 'Current production workflow', 'EZUCg1VIYohJJgKgwDTrTyH2sC32', '2VJar3Dimtp46XZzXAzhEZ');

-- Add comment explaining the table
COMMENT ON TABLE gumloop_workflows IS 'Stores saved Gumloop workflow URLs for easy A/B testing and resending';