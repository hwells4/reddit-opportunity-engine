# Reddit Agent Enhancement Plan

## Current Understanding
The Reddit Opportunity Engine currently finds subreddits based on user inputs but lacks:
1. An agentic loop for continued exploration until finding high-quality recommendations
2. A "Think" tool for self-evaluation
3. Standardized output formatting for frontend display

## Implemented Enhancements

### 1. Subreddit Metadata Enrichment ✅
- **Implemented**: Added real-time subreddit validation and metadata collection
- **Details**:
  - Created a dedicated utility (`subreddit_utils.py`) for fetching accurate subreddit metadata
  - Direct integration with Reddit's JSON API endpoints
  - Collects accurate subscriber counts, descriptions, creation dates, and activity metrics
  - Validates subreddit existence before recommending to users
  - Properly handles rate limits using exponential backoff and caching

### 2. Efficient Caching System ✅
- **Implemented**: Added in-memory caching to improve performance and reduce API calls
- **Details**:
  - Implemented in-memory cache for subreddit data
  - Prevents redundant API calls for previously validated subreddits
  - Properly clears cache after each run to prevent memory buildup
  - Added randomized delays between requests to avoid rate limiting

### 3. AI Prompt Enhancement ✅
- **Implemented**: Refactored system to provide validated metadata to AI during reasoning
- **Details**:
  - AI now receives accurate subscriber counts and descriptions during the decision process
  - Modified prompt to encourage prioritizing validated subreddits with higher relevance
  - Added explicit guidance for the AI to consider subreddit size, activity, and topic relevance
  - Comprehensive logging of AI calls for improved debugging and monitoring

## Proposed Future Enhancements

### 1. Implement Agentic Loop
- **Purpose**: Continue searching until at least 5 relevant, niche subreddits are found
- **Implementation**:
  - Add iteration mechanism to continue searching if initial results are insufficient
  - Implement evaluation criteria to filter out broad subreddits (like r/AskReddit)
  - Create tracking for search depth and quality of results
  - Add early termination if high-quality results are found quickly

### 2. Add "Think" Tool
- **Purpose**: Self-evaluate search progress and results quality
- **Implementation**:
  - Create evaluation function to assess subreddit relevance and niche quality
  - Implement decision-making logic for continuing or terminating search
  - Add reasoning capability to explain why certain subreddits were selected or rejected

### 3. Standardize Output Format
- **Partially Implemented** ✅: Added metadata fields to output
- **Remaining Tasks**:
  - Enhance existing Pydantic models for frontend compatibility
  - Add metadata fields for search time and iterations
  - Structure output for easy parsing in frontend components

### 4. Performance Optimization
- **Partially Implemented** ✅: Added caching and rate limit handling
- **Remaining Tasks**:
  - Implement parallel processing for web searches
  - Further optimize search queries for efficiency
  - Add timeout mechanisms to prevent excessive runtime

## Docker Configuration Notes
- The API service uses `restart: unless-stopped` to ensure continuous availability
- The CLI agent should be run using `docker-compose run` to prevent continuous restarts
- Example command: `docker-compose run reddit-discovery-agent python direct_openrouter.py --product-type "..." --problem-area "..." --target-audience "..."`

## Open Questions
1. What specific criteria define a "niche" subreddit vs. a general one?
2. How should the agent prioritize smaller, more focused communities vs. larger, somewhat relevant ones?
3. Details about the "Think" tool implementation
4. Examples of agentic loops from Cursor, Windsurf, Bolt that we should reference 