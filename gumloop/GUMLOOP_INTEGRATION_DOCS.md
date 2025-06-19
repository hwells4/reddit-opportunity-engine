# Gumloop Integration Documentation

## Overview
This document outlines the Gumloop integration requirements to complete the Supabase migration for Reddit quote analysis with 100% quote-to-post attribution.

## System Architecture

### Current State ✅
- ✅ Supabase tables (posts, quotes, runs) created and configured
- ✅ `/api/create-run` endpoint creates run records
- ✅ `/api/gumloop-raw` webhook endpoint for processing raw XML
- ✅ MVP flow script creates run_id and sends to Gumloop
- ✅ Discovery system refactored and working

### Remaining Integration Tasks 🚧

#### 1. Gumloop Pipeline Configuration
**Updated API Endpoint:**
```
https://api.gumloop.com/api/v1/start_pipeline?api_key=d44deb7dac124118aebf1a8de64649cd&user_id=EZUCg1VIYohJJgKgwDTrTyH2sC32&saved_item_id=bQzjcZgPM7DRAFReifJKwg
```

**Pipeline Flow:**
1. **Input**: `run_id` + selected subreddits from discovery system
2. **Processing**: Per-subreddit analysis with all posts batch processed
3. **Output**: Structured data sent to `/api/gumloop-raw` webhook

#### 2. Subreddit-Level Processing
**Requirement**: Process each subreddit individually, sending ONE API call per subreddit with ALL posts for that subreddit.

**Benefits:**
- Better error isolation (if one subreddit fails, others continue)
- Easier debugging and monitoring
- Proper attribution at subreddit level
- Cost optimization by batching posts per subreddit

#### 3. Data Flow Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MVP Script    │────│   Gumloop API    │────│  Webhook API    │
│  (creates run)  │    │  (processes by   │    │ (/api/gumloop-  │
│                 │    │   subreddit)     │    │      raw)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Supabase      │    │   XML Analysis   │    │  Posts + Quotes │
│   (runs table)  │    │  (per subreddit) │    │   Attribution   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Required Gumloop Functions

### Function 1: Subreddit Posts Collector
**Purpose**: Collect all Reddit posts for a specific subreddit
**Input**: `subreddit_name`, `post_limit`, `run_id`
**Output**: `posts_data`, `subreddit_info`, `collection_status`

### Function 2: Batch Post Analyzer  
**Purpose**: Analyze all posts for a subreddit in one LLM call
**Input**: `posts_data`, `analysis_prompt`, `run_id`
**Output**: `raw_xml_analysis`, `post_count`, `analysis_metadata`

### Function 3: Webhook Data Sender
**Purpose**: Send structured data to our webhook endpoint
**Input**: `raw_xml_analysis`, `posts_data`, `run_id`, `subreddit_name`
**Output**: `webhook_response`, `send_status`, `error_log`

### Function 4: Run Status Updater
**Purpose**: Update run status in our system
**Input**: `run_id`, `status`, `progress_data`
**Output**: `update_response`, `current_status`, `update_timestamp`

## Data Formats

### Expected Webhook Payload
```json
{
  "run_id": "uuid-string",
  "subreddit": "programming", 
  "posts": [
    {
      "post_id": "reddit_post_id",
      "subreddit": "programming",
      "url": "https://reddit.com/r/programming/comments/...",
      "title": "Post title",
      "body": "Post content",
      "raw_analysis": "<relevance_score>9</relevance_score><user_needs><quote>Quote text</quote></user_needs>..."
    }
  ],
  "analysis_metadata": {
    "posts_processed": 50,
    "analysis_timestamp": "2025-01-19T...",
    "model_used": "claude-3-sonnet"
  }
}
```

### Expected XML Analysis Format
```xml
<post_analysis post_id="reddit_id">
  <relevance_score>9 - High relevance because...</relevance_score>
  <question_relevance_flag>TRUE</question_relevance_flag>
  <user_needs>
    <quote is_question_relevant="true">Quote text here</quote>
    <quote is_question_relevant="false">Another quote</quote>
  </user_needs>
  <user_language>
    <quote is_question_relevant="true">User language quote</quote>
  </user_language>
  <current_solutions>
    <solution question_focus="true">Solution description</solution>
  </current_solutions>
  <feature_signals>
    <signal priority="high">Feature request signal</signal>
  </feature_signals>
</post_analysis>
```

## API Endpoints Needed

### 1. Webhook Endpoint (Existing)
**Endpoint**: `POST /api/gumloop-raw`
**Purpose**: Receive processed data from Gumloop
**Status**: ✅ Built and ready

### 2. Quote/Post Retrieval (Needed)
**Endpoint**: `GET /api/quotes?run_id={id}&post_id={id}`
**Purpose**: Retrieve quotes/posts by run_id and post_id
**Status**: 🚧 Needs to be built

**Expected Response:**
```json
{
  "success": true,
  "run_id": "uuid",
  "posts": [...],
  "quotes": [...],
  "summary": {
    "total_posts": 100,
    "total_quotes": 250,
    "categories": {...}
  }
}
```

## Implementation Priority

### Phase 1: Core Gumloop Functions (This Phase)
1. ✅ Update Gumloop API endpoint URL
2. 🚧 Write subreddit posts collector function
3. 🚧 Write batch post analyzer function  
4. 🚧 Write webhook data sender function
5. 🚧 Write run status updater function

### Phase 2: API Endpoints
1. 🚧 Build quote/post retrieval endpoint
2. 🚧 Add filtering and search capabilities
3. 🚧 Add export functionality

### Phase 3: Testing & Validation
1. 🚧 Test subreddit-level processing
2. 🚧 Verify 100% quote attribution
3. 🚧 Performance testing with large datasets

## Success Criteria

### Attribution Quality
- **Target**: 100% quote-to-post attribution
- **Method**: Deterministic quote IDs using `{post_id}_quote_{index}` format

### Cost Efficiency
- **Target**: Maintain ~$5 per 1,000 posts
- **Strategy**: Batch processing at subreddit level, single LLM calls per subreddit

### Error Handling
- **Graceful Degradation**: Continue processing other subreddits if one fails
- **Detailed Logging**: Track processing status per subreddit
- **Recovery**: Ability to reprocess failed subreddits

## Environment Variables

### Gumloop Configuration
```bash
# Updated endpoint
GUMLOOP_API_URL=https://api.gumloop.com/api/v1/start_pipeline
GUMLOOP_API_KEY=d44deb7dac124118aebf1a8de64649cd
GUMLOOP_USER_ID=EZUCg1VIYohJJgKgwDTrTyH2sC32
GUMLOOP_SAVED_ITEM_ID=bQzjcZgPM7DRAFReifJKwg

# Webhook endpoints
WEBHOOK_BASE_URL=https://your-app.com
GUMLOOP_RAW_WEBHOOK=/api/gumloop-raw
```

---

**Last Updated**: January 19, 2025  
**Status**: Phase 1 Implementation  
**Next Steps**: Write Gumloop Python functions 