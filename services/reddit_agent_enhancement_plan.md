# Reddit Agent Enhancement Plan

## Current Understanding
The Reddit Opportunity Engine currently finds subreddits based on user inputs but lacks:
1. An agentic loop for continued exploration until finding high-quality recommendations
2. A "Think" tool for self-evaluation
3. Standardized output formatting for frontend display

## Proposed Enhancements

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
- **Purpose**: Create consistent, structured output for frontend display
- **Implementation**:
  - Enhance existing Pydantic models for frontend compatibility
  - Add metadata fields (search time, iterations, confidence scores)
  - Structure output for easy parsing in frontend components
  - Implement JSON serialization with consistent schema

### 4. Performance Optimization
- **Purpose**: Ensure agent completes within 15-20 seconds timeframe
- **Implementation**:
  - Optimize search queries for efficiency
  - Implement parallel processing for web searches
  - Add timeout mechanisms to prevent excessive runtime
  - Cache intermediate results to avoid redundant processing

## Open Questions
1. What specific criteria define a "niche" subreddit vs. a general one?
2. How should the agent prioritize smaller, more focused communities vs. larger, somewhat relevant ones?
3. Details about the "Think" tool implementation
4. Examples of agentic loops from Cursor, Windsurf, Bolt that we should reference 