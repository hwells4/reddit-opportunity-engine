# Gumloop Integration

This folder contains the active Gumloop integration for processing Reddit posts and sending them to the `/api/process` endpoint.

## Active Files

### `post_id_generator.py`
**Purpose**: Generates proper UUID post_ids for Supabase compatibility  
**Input**: `urls`, `subreddit`  
**Output**: `id_list` with proper UUIDs and subreddit mapping

**Why needed**: Supabase requires valid UUID format for post_id field. This function ensures database compatibility.

### `simplified_batch_processor.py`
**Purpose**: Processes analyzed Reddit posts and sends them to the webhook endpoint  
**Input**: `analyzed_posts_list`, `run_id`, `subreddit_name`, `webhook_base_url`  
**Output**: `processing_status`, `webhook_response`, `post_count`

This is the main function used in the Gumloop pipeline to:
1. Format pre-analyzed posts from Gumloop
2. Send structured data to `/api/process` endpoint
3. Handle responses and error states

### `gumloop_notion_webhook.py`
**Purpose**: Notion integration webhook for processed data  
**Status**: Currently in use

### `test_simplified_processor.py`
**Purpose**: Test script for the simplified batch processor  
**Usage**: Run locally to test the processor function

### `analysis_prompt_optimized.md`
**Purpose**: Optimized analysis prompt for UUID-based posts  
**Usage**: Copy prompt into Gumloop LLM analysis step

## Integration Flow

```
1. post_id_generator.py → Generates UUIDs for posts
2. Gumloop LLM Analysis → Uses optimized prompt with UUIDs  
3. simplified_batch_processor.py → Formats and sends to webhook
4. /api/process → Parses and stores in Supabase with proper UUIDs
```

**Critical**: Use `post_id_generator.py` first to ensure database compatibility. The old approach of `subreddit-shortid` will cause database insertion failures.

## Expected Webhook Payload

```json
{
  "run_id": "uuid-string",
  "subreddit": "programming",
  "posts": [
    {
      "post_id": "reddit_post_id",
      "subreddit": "programming", 
      "url": "https://reddit.com/...",
      "title": "Post title",
      "body": "Post content",
      "author": "username",
      "created_utc": 1642680000,
      "score": 150,
      "num_comments": 25,
      "upvote_ratio": 0.95,
      "raw_analysis": "<post_analysis post_id=\"reddit_post_id\">...</post_analysis>"
    }
  ],
  "analysis_metadata": {
    "posts_processed": 50,
    "analysis_timestamp": "2025-01-19T...",
    "model_used": "gumloop_pipeline",
    "subreddit": "programming"
  }
}
```

## Testing

Run the test script:
```bash
cd gumloop/
python3 test_simplified_processor.py
```

Expected output:
- Posts processed: 2
- Quotes extracted: 5+ 
- Parse errors: 0

## Environment Requirements

The Next.js server must be running with these environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`