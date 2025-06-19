# Supabase Migration Project Tracking

## 🎯 Project Goal
Migrate from Google Sheets to Supabase for Reddit quote analysis to achieve **100% quote-to-post attribution** while maintaining cost efficiency with Gumloop.

## 📊 Current System Analysis

### What Works Now
- ✅ Gumloop processes ~1,000 posts via LLM analysis 
- ✅ Outputs structured XML-like format with quotes
- ✅ Costs ~$5 per run (acceptable)
- ✅ MVP flow script collects user input and triggers Gumloop

### The Attribution Problem
- ❌ Google Sheets loses quote-to-post links
- ❌ Python script searches 20k-30k rows to find links
- ❌ Manual attribution matching fails frequently
- ❌ No guaranteed link between quotes and Reddit URLs

## 🏗️ Architecture Overview

### New Flow Design
```
1. MVP Script → Create Run ID → Store in Supabase
2. MVP Script → Send Run ID to Gumloop 
3. Gumloop → Process posts → Return raw XML output
4. Our API → Parse XML → Extract quotes → Store with attribution
5. Report Generation → Query Supabase → Perfect attribution
```

### Cost Optimization Strategy
- Keep Gumloop for LLM processing (cheap rates)
- Move parsing/structuring to our code (free processing)  
- Avoid extra LLM calls in Gumloop (expensive)

### Key Implementation Decisions
1. **Server-side Parsing**: Parse XML in our API, not in Gumloop (saves credits)
2. **Deterministic Quote IDs**: `{post_id}_quote_{index}` format ensures perfect attribution
3. **Raw XML Storage**: Gumloop sends unparsed AI output, we handle all structuring
4. **Graceful Degradation**: Continue processing even if some posts fail parsing
5. **Foreign Key Constraints**: Database enforces quote→post→run relationships

## 💾 Database Schema Status

### ✅ Existing Supabase Tables
```sql
-- All tables exist and are properly structured
posts (post_id, subreddit, url, title, body, run_id, relevance_score...)
quotes (quote_id, post_id, run_id, text, category, context...)
runs (run_id, status, user_question, problem_area...)
```

### 🔑 Foreign Key Relationships
- `quotes.post_id → posts.post_id` (CASCADE DELETE)
- `quotes.run_id → runs.run_id` (CASCADE DELETE)
- `posts.run_id → runs.run_id` (CASCADE DELETE)

## 🛠️ Components Built

### ✅ API Endpoints Created
1. **`/api/create-run`** - Creates run record, returns run_id
   - Input: `{user_question, problem_area, target_audience, product_type, product_name}`
   - Output: `{run_id, status: "success"}`
   - Purpose: Initialize tracking before Gumloop processing

2. **`/api/gumloop-data`** - Original webhook endpoint (structured JSON)
   - Input: Pre-structured JSON with posts and quotes
   - **Note**: Not currently used, keeping for reference

3. **`/api/gumloop-raw`** - NEW primary webhook endpoint
   - Input: `{run_id, posts: [{post_id, subreddit, url, title, body, raw_analysis}]}`
   - Processing: Server-side XML parsing with robust error handling
   - Output: `{posts_processed, quotes_extracted, parse_errors}`
   - Purpose: Receives raw XML from Gumloop, parses quotes, stores with attribution

### ✅ Utility Functions
1. **`utils/supabase-queries.ts`** - Perfect attribution queries
   - `getQuotesWithAttribution(runId)` - Get all quotes with Reddit links
   - `getQuotesByCategory(runId, category)` - Filter quotes by category
   - `getRunSummary(runId)` - Get run statistics and metadata
   - Purpose: Replace Python Google Sheets searching

2. **`utils/gumloop-parser.py`** - Python XML parser (standalone)
   - Functions: `extract_relevance_score`, `extract_quotes_from_section` 
   - Purpose: Reference implementation, actual parsing done in API

### ✅ MVP Script Updates  
1. **`mvp_flow.py`** - Now creates run_id before processing
   - Creates run via `/api/create-run`
   - Sets `CURRENT_RUN_ID` environment variable
   - Error handling with run status updates

2. **`subreddit_selection.py`** - Updated to send run_id
   - Adds `run_id` to Gumloop pipeline_inputs
   - Displays run_id to user for tracking
   - Maintains existing Gumloop integration

## 🚧 What Still Needs To Be Done

### 🔴 Critical (Blocking)
1. ✅ **Environment Variables Setup** - COMPLETED
   - Created `ENVIRONMENT_SETUP.md` with all required variables
   - User needs to create `.env` file with Supabase credentials

2. ✅ **Gumloop Integration** - COMPLETED  
   - `run_id` now sent to Gumloop in pipeline_inputs
   - Created `/api/gumloop-raw` endpoint for webhook response
   - Robust error handling for XML parsing

3. ✅ **Error Handling for Inconsistent AI Output** - COMPLETED
   - Multiple fallback parsing patterns
   - Graceful degradation on parse errors
   - Continues processing even if some posts fail

### 🟡 Important (Next Phase)
4. ✅ **MVP Flow Updates** - COMPLETED
   - `run_id` properly sent to Gumloop via pipeline_inputs
   - Environment variable `CURRENT_RUN_ID` flows through system

5. **Testing & Validation**
   - Test create-run endpoint
   - Test gumloop-data webhook
   - Verify attribution queries work

6. **Report Generation Updates**
   - Replace Python Google Sheets script
   - Use new Supabase queries instead

## 📝 Implementation Details

### Current Gumloop Output Format
```xml
<relevance_score>9 - High relevance because...</relevance_score>
<question_relevance_flag>TRUE</question_relevance_flag>
<user_needs>
<quote is_question_relevant="true">PostID: "Quote text here"</quote>
</user_needs>
<user_language>
<quote is_question_relevant="true">"User language quote"</quote>
</user_language>
<current_solutions>
<solution question_focus="true">Solution description</solution>
</current_solutions>
```

### Expected API Input Format
```json
{
  "run_id": "uuid",
  "posts": [{
    "post_id": "reddit_id",
    "subreddit": "subreddit_name", 
    "url": "reddit_url",
    "title": "post_title",
    "body": "post_content",
    "relevance_score": 9,
    "question_relevance_flag": true,
    "content_classification": "HIGH_VALUE",
    "user_needs_quotes": [{"text": "quote", "is_question_relevant": true}],
    "user_language_quotes": [...],
    "current_solutions": [...],
    "feature_signals": [...]
  }]
}
```

## 🎛️ Environment Variables Needed

### Supabase Configuration
```bash
# .env file
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# For MVP script
API_BASE_URL=http://localhost:3000  # or production URL
```

### Gumloop Configuration
```bash
# Current
GUMLOOP_SAVED_ITEM_ID=96YEbP1uWuEtBKNsiraxN7

# New - webhook endpoint (IMPORTANT: Use gumloop-raw, not gumloop-data)
GUMLOOP_WEBHOOK_URL=https://your-app.com/api/gumloop-raw
```

## 🐛 Error Handling Strategy

### For Inconsistent AI Output
1. **Graceful Parsing**: Try multiple parsing patterns
2. **Fallback Extraction**: Use regex as backup for XML parsing
3. **Partial Success**: Store what we can parse, log what we can't
4. **Manual Review Queue**: Flag problematic outputs for review

### Specific Fallback Patterns Implemented
- **Relevance Score**: `<relevance_score>N` → `^N` → `score: N`
- **Question Flag**: `<question_relevance_flag>TRUE` → defaults to `true`
- **Quotes**: XML tags → simple quotes → any quoted text
- **Post ID Cleaning**: Removes `SubredditName-ID:` prefixes automatically

### Example Error Cases Handled
- Missing XML tags → Uses regex fallbacks
- Malformed quote structures → Extracts any quoted text
- Inconsistent attribute names → Multiple pattern matching
- Empty sections → Skips gracefully, logs warning
- Parse failures → Continue processing other posts

## 🧪 Testing Plan

### Phase 1: Local Testing
- [ ] Test create-run endpoint with Postman
- [ ] Test gumloop-data webhook with sample data
- [ ] Verify Supabase connections work
- [ ] Test attribution queries

### Phase 2: Integration Testing  
- [ ] Run MVP script with small dataset
- [ ] Verify run_id flows through system
- [ ] Test end-to-end with 10 posts

### Phase 3: Production Testing
- [ ] Test with full 1,000 post run
- [ ] Verify attribution accuracy
- [ ] Performance testing

## 📈 Success Metrics

### Attribution Quality
- **Target**: 100% quote-to-post attribution
- **Current**: ~70-80% (Google Sheets issues)

### Cost Efficiency  
- **Target**: Same $5 per 1,000 posts
- **Strategy**: Keep Gumloop for LLM, move parsing to our code

### Performance
- **Target**: Report generation < 30 seconds
- **Current**: Minutes of searching Google Sheets

## 🚀 Next Immediate Steps

### Phase 1: Local Setup & Testing (30 minutes)
1. **Create `.env` file** with Supabase credentials (see `ENVIRONMENT_SETUP.md`)
2. **Test create-run endpoint**: `curl -X POST http://localhost:3000/api/create-run -H "Content-Type: application/json" -d '{"user_question":"test"}'`
3. **Configure Gumloop webhook URL** to point to `/api/gumloop-raw` (production URL)
   - **CRITICAL**: Use `/api/gumloop-raw` NOT `/api/gumloop-data`
   - Gumloop should send: `{run_id, posts: [{post_id, subreddit, url, title, body, raw_analysis}]}`
4. **Test MVP flow** with small dataset to verify run_id flows through

### Phase 2: Production Deployment (15 minutes)  
1. **Deploy to Railway/Vercel** with environment variables
2. **Update Gumloop webhook URL** to production endpoint
3. **Test end-to-end flow** with real data

### Ready to Test
- ✅ All code components built
- ✅ Error handling implemented  
- ✅ Attribution system ready
- ✅ Cost optimization maintained

## 📚 Documentation Links

- [Supabase JavaScript Client Docs](https://supabase.com/docs/reference/javascript)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Gumloop Webhook Documentation](https://gumloop.com/docs/webhooks)

---

**Last Updated**: Current  
**Status**: In Development  
**Next Review**: After environment setup 