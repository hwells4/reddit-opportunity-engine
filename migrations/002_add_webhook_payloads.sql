-- Add webhook payload storage to runs table
ALTER TABLE runs
ADD COLUMN webhook_payload JSONB,
ADD COLUMN webhook_sent_at TIMESTAMP,
ADD COLUMN webhook_response JSONB;

-- Create index for faster lookups
CREATE INDEX idx_runs_webhook_sent_at ON runs(webhook_sent_at);

-- Add comment explaining the columns
COMMENT ON COLUMN runs.webhook_payload IS 'Original webhook payload sent to Gumloop';
COMMENT ON COLUMN runs.webhook_sent_at IS 'Timestamp when webhook was sent';
COMMENT ON COLUMN runs.webhook_response IS 'Response received from Gumloop API';