-- Migration: Add search-specific fields to posts table
-- This extends the existing posts table to support the new search API

-- Add search-specific columns to posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS snippet TEXT,
ADD COLUMN IF NOT EXISTS score INTEGER,
ADD COLUMN IF NOT EXISTS created_utc BIGINT,
ADD COLUMN IF NOT EXISTS vector vector(1536); -- For future pgvector support

-- Create index for efficient search queries
CREATE INDEX IF NOT EXISTS idx_posts_run_id ON public.posts(run_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_utc ON public.posts(created_utc DESC);
CREATE INDEX IF NOT EXISTS idx_posts_score ON public.posts(score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_subreddit ON public.posts(subreddit);

-- Create search_runs table to track search-specific metadata
CREATE TABLE IF NOT EXISTS public.search_runs (
  run_id UUID PRIMARY KEY,
  search_params JSONB NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  stats JSONB,
  cost_breakdown JSONB,
  account_id UUID REFERENCES public.accounts(account_id)
);

-- Create index for search runs
CREATE INDEX IF NOT EXISTS idx_search_runs_account_id ON public.search_runs(account_id);
CREATE INDEX IF NOT EXISTS idx_search_runs_started_at ON public.search_runs(started_at DESC);

-- Add comment to explain vector column
COMMENT ON COLUMN public.posts.vector IS 'OpenAI embedding vector (1536 dimensions) for semantic search';
COMMENT ON COLUMN public.posts.snippet IS 'Truncated preview of post content for search results';
COMMENT ON COLUMN public.posts.score IS 'Reddit karma score at time of fetching';
COMMENT ON COLUMN public.posts.created_utc IS 'Unix timestamp of post creation on Reddit';

-- Grant permissions
GRANT ALL ON public.search_runs TO postgres;
GRANT ALL ON public.search_runs TO service_role;