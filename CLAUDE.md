# Standard Workflow

1. First think through the problem, read the codebase for relevant files, and write a plan to projectplan.md

2. The plan should have a list of todo items that you can check off as you complete them

3. Before you begin working, check in with me and I will verify the plan

4. Then, begin working on the todo items, marking them as complete as you go

5. Please every step of the way just give me a high level explanation of what changes you made

6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity

7. Finally, add a review section to the projectplan.md file with a summary of the changes you made and any other relevant information

# System Architecture Updates

## Multi-Layer Redundancy Processing System

### Quote Processing Philosophy: "Never Fail, Always Learn"
- **Core Principle**: Posts are ALWAYS saved, quotes extracted when possible
- **Required Fields**: Only `text` and `reddit_url` needed for quote creation
- **All other fields optional** with sensible defaults (category: 'general', sentiment: 'neutral', etc.)

### Processing Layers (Most → Least Strict):
1. **Structured XML parsing** - Full analysis with all attributes
2. **Generic XML extraction** - Any `<quote>` tags, missing attrs get defaults  
3. **Regex quoted text** - Anything in "quotes" becomes a quote
4. **Smart sentence extraction** - Detects user feedback without quotes using emotional indicators, first person pronouns, problem keywords
5. **Unstructured fallback** - Always saves something, even raw data

### Key Endpoints:

#### `/api/process` (Gumloop Integration)
- **Never fails completely** - returns detailed processing results
- **Partial success model** - saves what works, reports what doesn't
- **Comprehensive error tracking** with fallback usage statistics
- **Response format**:
  ```json
  {
    "success": true,
    "posts_saved": 3,
    "quotes_extracted": 12,
    "total_errors": 1,
    "processing_details": {
      "fallbacks_used": ["generic_extraction"],
      "error_breakdown": {"quote_parsing": 1},
      "partial_successes": 1
    }
  }
  ```

#### `/api/monitor` (System Health)
- `GET /api/monitor?view=health` - System status and alerts
- `GET /api/monitor?view=errors` - Error pattern analysis with recommendations
- `GET /api/monitor?view=full` - Complete metrics
- `POST /api/monitor {"action": "reset"}` - Reset monitoring data

#### `/api/quotes/create` (Manual Quote Creation)
- **Minimal requirements**: Just `text` and `reddit_url`
- **All other fields optional** with sensible defaults
- **Example**:
  ```json
  {
    "text": "I really need better task management",
    "reddit_url": "https://reddit.com/r/productivity/comments/example/",
    "category": "user_needs",
    "sentiment": "frustrated"
  }
  ```

### Database Schema Notes:
- **runs table**: Uses `start_time` column (not `created_at`)
- **quotes table**: All fields except `text` have defaults
- **posts table**: Always created even if quote parsing fails

### Monitoring & Learning:
- **Real-time success rate tracking** (posts, quotes, overall)
- **Error pattern analysis** - identifies common failure types
- **Fallback usage statistics** - shows which backup systems activate
- **Smart recommendations** - suggests system improvements based on failure patterns
- **Zero self-modification** - system collects data for human analysis, doesn't change itself

### Testing:
- `test-gumloop-integration.js` - Comprehensive integration test script
- Tests all failure scenarios: perfect XML, malformed XML, no structure, empty content
- Validates Railway deployment readiness before real Gumloop integration
