# Gumloop Integration Functions

This folder contains the Python functions needed to complete the Gumloop integration for the Supabase migration, enabling 100% quote-to-post attribution.

## Function Overview

### 1. `subreddit_posts_collector.py`
**Purpose**: Collects all Reddit posts for a specific subreddit  
**Input**: `subreddit_name`, `post_limit`, `run_id`  
**Output**: `posts_data`, `subreddit_info`, `collection_status`

### 2. `batch_post_analyzer.py`
**Purpose**: Analyzes all posts for a subreddit in one LLM call  
**Input**: `posts_data`, `analysis_prompt`, `run_id`  
**Output**: `raw_xml_analysis`, `post_count`, `analysis_metadata`

### 3. `webhook_data_sender.py`
**Purpose**: Sends structured data to webhook endpoint  
**Input**: `raw_xml_analysis`, `posts_data`, `run_id`, `subreddit_name`  
**Output**: `webhook_response`, `send_status`, `error_log`

### 4. `run_status_updater.py`
**Purpose**: Updates run status in the system  
**Input**: `run_id`, `status`, `progress_data`  
**Output**: `update_response`, `current_status`, `update_timestamp`

### 5. `subreddit_processor_orchestrator.py`
**Purpose**: Main orchestrator that coordinates all functions  
**Input**: `subreddit_name`, `post_limit`, `run_id`, `analysis_prompt`  
**Output**: `processing_results`, `final_status`, `webhook_data`

## Gumloop Workflow Setup

### Updated API Endpoint
```
https://api.gumloop.com/api/v1/start_pipeline?api_key=d44deb7dac124118aebf1a8de64649cd&user_id=EZUCg1VIYohJJgKgwDTrTyH2sC32&saved_item_id=bQzjcZgPM7DRAFReifJKwg
```

### Pipeline Configuration

#### Step 1: Initialize Run
- Input: `run_id` from MVP script
- Action: Update run status to "processing"

#### Step 2: Process Each Subreddit
- Loop through selected subreddits
- For each subreddit:
  1. Collect posts (`subreddit_posts_collector.py`)
  2. Analyze with LLM (`batch_post_analyzer.py`)
  3. Send to webhook (`webhook_data_sender.py`)
  4. Update status (`run_status_updater.py`)

#### Step 3: Finalize Run
- Update run status to "completed"
- Send final summary

### Environment Variables Needed

```python
# Required in Gumloop environment
OPENROUTER_API_KEY=your_openrouter_key
WEBHOOK_BASE_URL=https://your-app.com
API_BASE_URL=https://your-app.com
```

## Data Flow

```
MVP Script → Creates run_id → Sends to Gumloop
     ↓
Gumloop receives: {run_id, selected_subreddits, analysis_prompt}
     ↓
For each subreddit:
  1. Collect posts from Reddit API
  2. Batch analyze all posts with Claude
  3. Send raw XML + posts to /api/gumloop-raw
  4. Update run status
     ↓
Webhook API parses XML → Stores in Supabase → 100% attribution
```

## Expected Webhook Payload

```json
{
  "run_id": "uuid-string",
  "subreddit": "programming",
  "posts": [
    {
      "post_id": "reddit_id",
      "subreddit": "programming", 
      "url": "https://reddit.com/...",
      "title": "Post title",
      "body": "Post content",
      "author": "username",
      "created_utc": 1642680000,
      "score": 150,
      "num_comments": 25,
      "upvote_ratio": 0.95,
      "raw_analysis": "<post_analysis post_id=\"reddit_id\">...</post_analysis>"
    }
  ],
  "analysis_metadata": {
    "posts_processed": 50,
    "analysis_timestamp": "2025-01-19T...",
    "model_used": "claude-3-sonnet",
    "subreddit": "programming"
  }
}
```

## Function Implementation Details

### All Functions Follow These Rules:
1. ✅ All imports inside the `def function():` statement
2. ✅ Must start with `def function(input1, input2, input3):` 
3. ✅ Must end with `return output1, output2, output3`
4. ✅ No logic in def or return statements
5. ✅ All code contained within the function body

### Error Handling Strategy:
- Each function includes comprehensive try/catch blocks
- Graceful degradation when external services fail
- Detailed error logging for debugging
- Fallback responses to keep pipeline running

### Rate Limiting:
- Reddit API: 1 request per second
- OpenRouter: Built-in rate limiting
- Webhook: 30 second timeout

## Testing

### Local Testing
1. Test each function individually with sample data
2. Test full orchestrator with small dataset
3. Verify webhook receives correct payload format

### Production Testing
1. Test with single subreddit, 10 posts
2. Scale to multiple subreddits
3. Full production test with 1,000 posts

## Integration Checklist

### Phase 1: Gumloop Setup ✅
- [x] Update Gumloop API endpoint URL
- [x] Add environment variables
- [x] Import function files
- [x] Configure pipeline workflow

### Phase 2: Function Implementation 🚧
- [x] Create all 5 function files
- [ ] Test individual functions
- [ ] Test orchestrator workflow
- [ ] Verify webhook integration

### Phase 3: Production Deployment 🚧
- [ ] Deploy webhook endpoint updates
- [ ] Configure production environment variables
- [ ] Test end-to-end flow
- [ ] Monitor error rates and performance

## Expected Results

### Attribution Success
- **Before**: 70-80% quote attribution (Google Sheets issues)
- **After**: 100% quote attribution (deterministic IDs)

### Cost Efficiency
- **Target**: Maintain ~$5 per 1,000 posts
- **Method**: Batch processing, single LLM calls per subreddit

### Error Resilience
- **Isolation**: Subreddit-level failure isolation
- **Recovery**: Detailed logging for failed subreddits
- **Monitoring**: Real-time status updates per subreddit

---

**Next Steps**: 
1. Import functions into Gumloop
2. Configure pipeline workflow
3. Test with small dataset
4. Scale to production 