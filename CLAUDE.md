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

# User Account Management System

## Overview
Comprehensive account management system for tracking customers, associating runs with accounts, and enabling usage-based billing. Built for seamless demo workflows while scaling toward full SaaS architecture.

## Core Architecture

### Database Schema
```sql
accounts (
  account_id uuid PRIMARY KEY,
  company_name text NOT NULL,           -- Used in Gumloop 'name' field
  contact_name text NOT NULL,
  email text NOT NULL UNIQUE,
  website_url text,
  company_description text,            -- For AI context in reports
  industry text,                       -- For personalized insights
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
)

runs (
  -- existing fields --
  account_id uuid NOT NULL REFERENCES accounts(account_id)  -- REQUIRED for all new runs
)
```

### Key API Endpoints

#### Account Management
- `POST /api/accounts` - Create new account (CLI integrated)
- `GET /api/accounts` - List accounts with search/filter  
- `GET /api/accounts/search` - CLI-optimized search by company/name/email
- `PUT /api/accounts?account_id=X` - Update account information

#### Usage Tracking & Analytics  
- `GET /api/accounts/[id]/usage` - Detailed usage statistics
- `POST /api/accounts/[id]/usage` - Calculate costs with flexible pricing

#### Enhanced Runs API
- `POST /api/runs` - **Now requires account_id** (validates account exists)
- `GET /api/runs?user_id=X` - Filter runs by account for analytics

## CLI Integration (Subtext v1)

### Enhanced Workflow
1. **Account Selection** (NEW - Step 1)
   - Search existing accounts by company/name/email
   - Quick create new accounts (30 seconds)
   - Use recent accounts
2. **Discovery Parameters** (existing)
3. **AI-Powered Discovery** (existing) 
4. **Human Selection** (existing)
5. **Analysis Configuration** (enhanced - email defaults to account)
6. **Gumloop Integration** (enhanced - company name in payload)

### Account Selection Interface
```
Select an existing account or create a new one:
1. Search existing accounts        # Type "Tesla" → find Tesla Inc
2. Create new account             # Quick 5-field form
3. Use recent accounts            # Show last 10 accounts

Choose option (1-3): 1
Search by company name, contact name, or email: Tesla
```

### Gumloop Payload Enhancement
**Only change**: `name` field now uses `account.company_name` instead of contact name
- All other fields remain identical to existing system
- `run_id` automatically included for tracking

## Usage Tracking & Billing

### Multi-Level Tracking
1. **Per Run** - Primary billing unit (each analysis run)
2. **Per Post** - Secondary metric (total posts analyzed across all runs)  
3. **Per Quote** - Granular metric (quotes extracted across all runs)

### Flexible Cost Calculation
```bash
# Example API call for cost calculation
curl -X POST /api/accounts/[id]/usage \
  -d '{"cost_per_run": 5.00, "cost_per_post": 0.10, "cost_per_quote": 0.05}'

# Returns detailed breakdown:
{
  "cost_breakdown": {
    "runs": {"count": 12, "cost_per_unit": 5.00, "total_cost": 60.00},
    "posts": {"count": 450, "cost_per_unit": 0.10, "total_cost": 45.00}, 
    "quotes": {"count": 89, "cost_per_unit": 0.05, "total_cost": 4.45}
  },
  "total_estimated_cost": 109.45
}
```

### Analytics Available
- Total/completed/running/failed runs per account
- Historical usage trends and date ranges
- Average posts/quotes per run
- Recent run history with individual breakdowns
- Cost projections with configurable pricing

## Notion Integration Enhancement

### Personalized Reports
- **Company names** automatically pulled from account data (not email extraction)
- **Industry context** included in AI-generated report introductions
- **Company descriptions** used for relevance explanations
- **Website URLs** available for additional context

### Enhanced AI Prompts
```javascript
// Before: "Write a report intro for this client..."
// After: "Write a report intro for Tesla Inc's automotive business..."
```

## Migration & Compatibility

### Existing Data Handling
- **Demo Account**: Auto-created for existing runs (`account_id: 00000000-0000-0000-0000-000000000001`)
- **Zero data loss**: All existing runs preserved and queryable
- **Backward compatibility**: Old endpoints still work during transition

### Future Extensibility  
- **Clerk Integration Ready**: Existing `profiles` table designed for Clerk user management
- **Stripe Ready**: `stripe_customer_id` field in profiles table
- **Multi-user Support**: Accounts can be associated with multiple authenticated users

## Demo Workflow Benefits

### For Sales/Demos
1. **Fast Account Setup**: Search "Tesla" or create new account in 30 seconds
2. **Professional Tracking**: Each demo run properly associated with prospect
3. **Usage Analytics**: Show prospects their analysis history and costs
4. **Personalized Reports**: Notion reports use actual company names

### For Scaling Business
1. **Usage-Based Billing**: Track exactly what each customer uses
2. **Cost Analysis**: Understand profitability per account  
3. **Customer Analytics**: See engagement patterns and usage trends
4. **Automated Tracking**: No manual work - every run automatically tracked

## Testing & Validation
- **Comprehensive Test Suite**: `test-user-system.js` validates all endpoints
- **Live Testing Confirmed**: All endpoints working in production
- **Error Handling**: Proper validation and user-friendly error messages
- **Performance**: Fast search and account creation workflows

## Important Notes
- **Account Required**: All new runs MUST have valid account_id (enforced by API)
- **Cost Flexibility**: Pricing completely configurable via API (not hardcoded)  
- **Gumloop Compatibility**: Only change is company name in 'name' field
- **Search Optimized**: CLI search designed for fast company/contact/email lookup

# Notion Quotes Integration System

## Overview
Comprehensive quotes database system that automatically exposes all captured quotes to clients through individual Notion databases with detailed analysis metrics.

## Core Architecture

### Individual Database Approach
- **Each run gets its own quotes database** - perfect client isolation
- **Created as child of branded homepage** - easy access and organization
- **No filtering required** - clients only see their relevant quotes
- **Rich metadata exposure** - category, sentiment, theme, relevance scores

### Automatic Integration
- **Triggered by runId presence** in add-to-notion API calls
- **Non-breaking implementation** - quote failures don't affect report creation
- **Analysis metrics prominently displayed** - posts analyzed and quotes extracted counts
- **Seamlessly integrated** with existing Gumloop webhook workflow

## Key Endpoints

#### `/api/add-to-notion` (Enhanced)
- **Automatic quotes integration** when `runId` provided
- **Analysis summary callout** showing post/quote counts
- **Dedicated database creation** as child of branded homepage
- **Enhanced response** includes quotes database information

#### `/api/add-to-notion/quotes` (Standalone)
- `POST` - Manually create quotes database for a run
- `GET` - Preview quotes and statistics for a run
- **Account integration** - fetches company names from accounts table
- **Batch processing** with rate limiting for large quote volumes

## Database Schema (Per Run)
```javascript
{
  "Quote": title,              // The quote text (searchable)
  "Category": select,          // user_needs, user_language, feature_signals, etc.
  "Sentiment": select,         // positive, negative, neutral, frustrated, etc.
  "Theme": select,            // general, user_feedback, pain_point, etc.
  "Reddit Link": url,         // Direct link to source post
  "Relevance Score": number,  // 0.0 to 1.0 scoring
  "Date Added": date,         // When quote was captured
  "Post ID": rich_text        // Reference to source post
}
```

## User Experience

### What Clients See
1. **Analysis Summary Callout**: "📈 Analysis Summary: We reviewed 45 posts and extracted 127 valuable quotes for this research."
2. **Quotes Database Link**: "We analyzed 45 posts and extracted 127 valuable quotes from this research. View the complete quotes database..."
3. **Dedicated Database**: Full sortable/filterable table with all quotes and metadata
4. **Built-in Notion Views**: Group by Category, Sentiment, Theme for analysis

### Database Features
- **Perfect Isolation**: Only quotes from their specific run
- **Rich Sorting**: By relevance score, date, category, sentiment
- **Powerful Filtering**: Notion's native filter system for deep analysis
- **Export Capable**: Clients can export data in various formats
- **Link Integration**: Direct links back to source Reddit posts

## Implementation Files

### Core Modules
- **`notionQuotesHelpers.ts`** - All quote database functionality
- **`quotes/route.ts`** - Standalone quotes API endpoints
- **Enhanced main route** - Automatic integration with reports

### Key Functions
- `fetchRunStatistics()` - Gets post and quote counts for metrics display
- `createQuotesDatabase()` - Creates individual database per run
- `addQuotesToNotion()` - Batch processes quotes with rate limiting
- `createQuotesLinkBlock()` - Generates formatted homepage links with counts

## Workflow Integration

### Gumloop Pipeline
1. **Posts processed** and quotes extracted (existing)
2. **Webhook calls** add-to-notion with `runId` (existing)
3. **Reports created** in Notion (existing)
4. **Run statistics fetched** - post and quote counts (new)
5. **Analysis summary displayed** on homepage (new)
6. **Quotes database created** as child page (new)
7. **All quotes added** with full metadata (new)
8. **Homepage updated** with quotes link and metrics (new)

### Benefits for Users
- **Immediate understanding** of analysis scope through metrics
- **Direct access** to all extracted insights in organized format
- **Professional presentation** with no setup or filtering required
- **Data ownership** - clients can export and analyze independently
- **Rich metadata** for deeper analysis and insights discovery

## Performance & Scalability
- **No API limitations** - individual databases avoid filtering constraints
- **Notion confirmed** no limits on database creation
- **Rate limiting handled** - batch processing prevents API throttling
- **Error resilient** - quote processing failures don't break reports
- **Resource efficient** - only relevant data per database

# Webhook Resend & A/B Testing System

## Overview
Comprehensive webhook management system for resending failed webhooks and A/B testing across multiple Gumloop workflows. Enables quick iteration and testing without re-running full discovery processes.

## Core Architecture

### Database Enhancement
```sql
-- Webhook payload storage (migration 002)
ALTER TABLE runs ADD COLUMN webhook_payload JSONB;
ALTER TABLE runs ADD COLUMN webhook_sent_at TIMESTAMP;
ALTER TABLE runs ADD COLUMN webhook_response JSONB;

-- Gumloop workflows management (migration 003)
CREATE TABLE gumloop_workflows (
  workflow_id UUID PRIMARY KEY,
  workflow_name TEXT NOT NULL,
  workflow_url TEXT NOT NULL,
  description TEXT,
  user_id TEXT,
  saved_item_id TEXT,
  is_active BOOLEAN DEFAULT true
);
```

### Key API Endpoints

#### `/api/workflows` - Workflow Management
- **POST** `/api/workflows` - Save new Gumloop workflow URL with friendly name
- **GET** `/api/workflows` - List all saved workflows
- **GET** `/api/workflows?search=term` - Search workflows by name/description
- **PUT** `/api/workflows?workflow_id=X` - Update existing workflow
- **Auto-extracts** user_id and saved_item_id from Gumloop URLs

#### `/api/webhooks/resend` - Webhook Resending & A/B Testing
- **GET** `/api/webhooks/resend?run_id=X` - View stored webhook data
- **POST** `/api/webhooks/resend` - Resend webhook with modifications or A/B test

**Two main use cases:**
1. **Resend Failed Webhook**: Fix and resend to original or specified workflow
2. **A/B Test**: Send identical webhook to multiple Gumloop workflows

#### `/api/start-pipeline` - Enhanced Webhook Storage
- **Automatic storage** of webhook payloads after successful Gumloop send
- **Non-blocking** - storage failures don't affect webhook sending
- **Comprehensive validation** - array length matching, zero subscriber prevention

## CLI Tools

### `subtext-dev.ts` - Unified Development Tool
```bash
npm run subtext-dev
```

**Main Functions:**
1. **🆕 Create Gumloop Workflow** - Save workflow URLs with friendly names
2. **🔄 Resend Failed Webhook** - Fix and resend with optional modifications  
3. **🧪 A/B Test Webhook** - Test across multiple saved workflows

### `subtext-v1.ts` - Main Discovery Workflow (unchanged)
```bash
npm run subtext
```

## Workflow Management Features

### Save Gumloop Workflows
- **Paste any Gumloop URL**: Auto-extracts user_id and saved_item_id
- **Friendly names**: "Production v1", "New Experiment", "Testing Flow"
- **Descriptions**: Optional context for each workflow
- **Search & reuse**: Find workflows quickly by name

### Example Workflow Storage
```json
{
  "workflow_name": "Production v1",
  "workflow_url": "https://api.gumloop.com/api/v1/start_pipeline?user_id=ABC&saved_item_id=XYZ",
  "description": "Current production workflow",
  "user_id": "ABC",
  "saved_item_id": "XYZ"
}
```

## Webhook Resending Features

### Automatic Payload Storage
- **Triggered after successful webhook send** in `/api/start-pipeline`
- **Stores**: Original request body, timestamp, Gumloop response
- **Safe updates**: Only touches webhook fields, preserves all run data

### Resend Capabilities
- **Direct modifications**: Change specific fields (post_limit, subreddits, etc.)
- **AI-assisted modifications**: Natural language requests ("reduce post limit to 50")
- **Validation**: All original validations apply (array lengths, zero subscribers)
- **Unique run IDs**: Each resend gets tracking ID like `original-resend-timestamp`

### A/B Testing Features
- **Multiple workflows**: Send identical payload to different Gumloop workflows
- **Direct to Gumloop**: Bypasses start-pipeline, sends directly to workflow URLs
- **Result comparison**: Shows success/failure for each workflow tested
- **Unique tracking**: Each test gets ID like `original-resend-workflow-name`

## Example A/B Test Response
```json
{
  "success": true,
  "original_run_id": "abc123",
  "test_results": [
    {
      "workflow_name": "Production v1", 
      "run_id": "abc123-resend-production-v1",
      "success": true,
      "response": {"tracking_url": "https://gumloop.com/track/xyz"}
    },
    {
      "workflow_name": "Experimental v2",
      "run_id": "abc123-resend-experimental-v2", 
      "success": true,
      "response": {"tracking_url": "https://gumloop.com/track/abc"}
    }
  ],
  "summary": {
    "total_workflows": 2,
    "successful": 2,
    "failed": 0
  }
}
```

## Validation Enhancements

### Webhook Payload Validation
- **Array length matching**: Subreddits and subscribers arrays must have same count
- **Zero subscriber prevention**: No subreddits with zero or negative subscribers
- **Invalid data filtering**: Removes invalid entries before sending
- **Detailed error logging**: Comprehensive error tracking for debugging

### CLI Pre-validation
- **Filters invalid subreddits** before webhook creation
- **Double-checks array consistency** 
- **User warnings** for filtered subreddits
- **Prevents sending** if no valid subreddits remain

## Scripts Cleanup
**Removed redundant files:**
- `webhook-manager.ts` → Replaced by `subtext-dev.ts`
- `resend-webhook.ts` → Replaced by `subtext-dev.ts`
- `test-webhook-resend.js` → Examples only
- `test-webhook-validation.js` → Validation built into API

**Remaining scripts:**
- `subtext-v1.ts` - Main discovery workflow
- `subtext-dev.ts` - Development & testing tool

## Use Cases

### 1. Fix Failed Webhooks
```bash
npm run subtext-dev
# Choose option 2: Resend failed webhook
# Enter run_id, optionally modify fields
# Webhook resent with fixes
```

### 2. Test New Gumloop Workflows
```bash
npm run subtext-dev  
# Choose option 1: Create workflow
# Paste new Gumloop URL, give it a name
# Choose option 3: A/B test 
# Select old and new workflows, compare results
```

### 3. Compare System Versions
- Save "Production v1" and "Staging v2" workflow URLs
- A/B test identical webhook against both
- Compare tracking URLs and results
- Perfect for testing system upgrades

## Benefits

### For Development
- **Quick iteration**: Test changes without full discovery runs
- **A/B testing**: Compare different Gumloop workflows with identical data
- **Debugging**: Easy webhook modification and resending
- **Validation**: Prevents common webhook failures

### For Business
- **Workflow versioning**: Save and name different Gumloop setups
- **Quality assurance**: Test new workflows before production
- **Error recovery**: Quick fixes for failed webhooks
- **Performance comparison**: Measure different workflow effectiveness

## Technical Notes
- **Supabase integration**: Uses existing database connection patterns
- **Railway deployment**: Automatically connects to production environment
- **OpenAI integration**: AI-assisted webhook modifications via GPT-4o-mini
- **Error resilience**: Comprehensive error handling and validation
- **Rate limiting**: Respects Gumloop API limits

# Pending Code Cleanup Tasks

## From CODE_CLEANUP_ANALYSIS.md (to be completed)
- Remove 37 unused UI components from components/ui/
- Remove unused npm dependencies (see CODE_CLEANUP_ANALYSIS.md for full list)
- This cleanup could reduce bundle size by ~500KB-1MB
