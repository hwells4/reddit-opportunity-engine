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

# Pending Code Cleanup Tasks

## From CODE_CLEANUP_ANALYSIS.md (to be completed)
- Remove 37 unused UI components from components/ui/
- Remove unused npm dependencies (see CODE_CLEANUP_ANALYSIS.md for full list)
- This cleanup could reduce bundle size by ~500KB-1MB
