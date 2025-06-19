# Enhanced Discovery System Documentation

## Overview

The Enhanced Discovery System is a complete rewrite of the original Python-based Reddit discovery agent into a modular, scalable TypeScript system with agentic AI capabilities, real Reddit validation, and human-in-the-loop selection.

## Architecture

### Core Philosophy
- **Agentic AI**: Let AI generate intelligent queries instead of hardcoded prompts
- **Real Data**: Use actual Reddit API for validation and subscriber counts
- **Modular Design**: Clean separation of concerns for maintainability
- **Human-in-the-Loop**: Allow human selection and refinement
- **Graceful Degradation**: Fallbacks when external services fail

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Discovery System                         │
├─────────────────────────────────────────────────────────────┤
│  📁 lib/discovery/                                          │
│  ├── types.ts              # Shared interfaces             │
│  ├── reddit-validator.ts   # Real Reddit API validation    │
│  ├── perplexity.ts        # Agentic Perplexity queries     │
│  ├── firecrawl.ts         # Agentic Firecrawl search       │
│  ├── ai-analysis.ts       # OpenRouter categorization      │
│  ├── orchestrator.ts      # Main discovery logic           │
│  └── index.ts             # Exports & utilities            │
├─────────────────────────────────────────────────────────────┤
│  🌐 app/api/                                                │
│  ├── discover/route.ts         # Main discovery endpoint   │
│  ├── discover/validate/route.ts # Reddit validation API   │
│  └── discover/select/route.ts   # Human selection API     │
├─────────────────────────────────────────────────────────────┤
│  🖥️ scripts/                                                │
│  └── subtext-v1.ts        # CLI using new system          │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### POST `/api/discover`
**Main discovery orchestrator endpoint**

**Input:**
```json
{
  "product_type": "SaaS Tool",
  "problem_area": "Time management", 
  "target_audience": "Startup founders",
  "additional_context": "Focus on productivity"
}
```

**Output:**
```json
{
  "success": true,
  "discovery_method": "enhanced_ai_powered_modular",
  "total_subreddits_found": 15,
  "discovery_sources": {
    "perplexity_count": 8,
    "firecrawl_count": 12,
    "fallback_count": 0
  },
  "recommendations": {
    "primary": [...],
    "secondary": [...], 
    "niche": [...]
  },
  "validated_subreddits": [...],
  "summary": "Discovery summary...",
  "candidates": [...],
  "timestamp": "2025-01-19T..."
}
```

### GET `/api/discover`
**Health check endpoint**

Returns service status and capabilities.

### POST `/api/discover/validate`
**Batch Reddit validation**

**Input:**
```json
{
  "subreddit_names": ["programming", "webdev", "javascript"]
}
```

**Output:**
```json
{
  "success": true,
  "validated_subreddits": [
    {
      "name": "programming",
      "subscribers": 4500000,
      "description": "Computer Programming",
      "is_active": true,
      "over_18": false,
      "validation_status": "valid"
    }
  ],
  "summary": { "total_requested": 3, "valid_count": 3, ... }
}
```

### GET `/api/discover/validate?name=programming`
**Single subreddit validation**

Quick validation for individual subreddits.

### POST `/api/discover/select`
**Human selection processing**

**Input:**
```json
{
  "candidates": [...],
  "selected_subreddits": ["programming", "webdev"],
  "user_notes": "Selected for technical audience"
}
```

### GET `/api/discover/select?product_type=X&target_audience=Y`
**Quick discovery preview**

Lightweight discovery for selection interfaces.

## Service Details

### 1. Reddit Validator (`reddit-validator.ts`)
**Purpose**: Real Reddit API validation with subscriber counts

**Key Features:**
- Uses `https://www.reddit.com/r/{subreddit}/about.json`
- Rate limiting (1 request/second)
- Handles private/not found/error states
- Returns actual subscriber counts needed for Gumloop

**Methods:**
- `validateSubreddit(name)` - Single validation
- `validateSubreddits(names)` - Batch validation with error handling
- `getSubredditInfo(name)` - Lightweight info retrieval

### 2. Perplexity Service (`perplexity.ts`)
**Purpose**: Agentic AI-powered subreddit discovery

**Key Features:**
- AI generates intelligent search queries (not hardcoded!)
- Uses `llama-3.1-sonar-large-128k-online` model
- Reddit-specific domain filtering
- Context-aware subreddit extraction

**Flow:**
1. AI Analysis Service generates 4-6 intelligent queries
2. Each query sent to Perplexity with expert system prompt
3. Extract subreddit mentions from responses
4. Deduplicate and return with context

### 3. Firecrawl Service (`firecrawl.ts`)
**Purpose**: Web search-based subreddit discovery

**Key Features:**
- AI generates intelligent web search queries
- Searches actual Reddit content via Firecrawl
- Extracts subreddits from URLs and content
- Context extraction around mentions

**Flow:**
1. AI generates search queries with `site:reddit.com`
2. Firecrawl searches web for Reddit discussions
3. Extract subreddit names from URLs and content
4. Provide context about why subreddit is relevant

### 4. AI Analysis Service (`ai-analysis.ts`)
**Purpose**: OpenRouter-based AI analysis and categorization

**Key Features:**
- Proper OpenRouter client (not "OpenAI")
- Model fallback system (Claude → GPT-4 → etc.)
- Intelligent query generation for external services
- Subreddit categorization and scoring

**Methods:**
- `generateSearchQueries()` - Creates intelligent queries for Perplexity/Firecrawl
- `categorizeSubreddits()` - AI-powered relevance scoring and categorization
- `makeAICall()` - Robust AI calls with fallbacks

### 5. Discovery Orchestrator (`orchestrator.ts`)
**Purpose**: Main coordination and workflow management

**Flow:**
1. **Multi-source Discovery**: Perplexity + Firecrawl + Fallbacks
2. **Validation**: Real Reddit API validation
3. **AI Analysis**: Categorization and scoring
4. **Results Compilation**: Structured output

**Methods:**
- `discoverSubreddits()` - Full discovery workflow
- `quickDiscovery()` - Lightweight preview discovery
- `validateSpecificSubreddits()` - Validate user-provided list
- `healthCheck()` - Service health monitoring

## Prompting Strategy

### Perplexity Prompts
**No hardcoded prompts!** The AI Analysis Service generates intelligent queries based on:

**System Prompt:**
```
You are a Reddit expert with deep knowledge of communities and their cultures. When analyzing Reddit communities, focus on:
1. Community size and activity levels
2. How welcoming they are to new members  
3. Their specific rules and moderation style
4. What types of content perform well
5. The community's attitude toward business/promotional content
```

**Query Generation:**
The AI dynamically creates queries like:
- "What are the most active Reddit communities where startup founders discuss time management challenges?"
- "Which subreddits have engaged discussions about productivity tools for entrepreneurs?"
- "Reddit communities where busy professionals seek help with workflow optimization"

### Firecrawl Prompts
**Also agentic!** Generates web search queries like:
- `productivity tools startup founders site:reddit.com`
- `time management SaaS discussion reddit community`
- `"workflow optimization" entrepreneurs help reddit`

### AI Categorization Prompts
**Detailed analysis prompt** for subreddit categorization:
```
Analyze these Reddit communities for a {product_type} targeting {target_audience} who struggle with {problem_area}.

Categorize into:
1. PRIMARY: Highest relevance, direct target audience, perfect fit
2. SECONDARY: Good relevance, broader audience, still valuable
3. NICHE: Specific use cases, smaller but highly targeted segments

For each subreddit provide:
- Relevance score (1-10)
- Specific reason why it's relevant  
- Recommended engagement approach for this community
```

## Subtext v1 CLI

### Usage
```bash
npx tsx scripts/subtext-v1.ts
```

### Flow
1. **Input Collection**: Product type, problem area, target audience
2. **Create Run**: Database tracking via `/api/runs`
3. **AI Discovery**: Full discovery via `/api/discover`
4. **Human Selection**: Interactive CLI selection of candidates
5. **Analysis Config**: Email and post limit collection
6. **Gumloop Integration**: Webhook payload creation and submission

### Features
- Colorized output with progress indicators
- Category-based subreddit display (Primary/Secondary/Niche)
- Test mode for payload verification
- Graceful error handling and fallbacks
- Real-time feedback during AI discovery

## Environment Variables

### Required
```bash
# Core APIs
OPENROUTER_API_KEY=your_openrouter_key
PERPLEXITY_API_KEY=your_perplexity_key  
FIRECRAWL_API_KEY=your_firecrawl_key

# Database
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Gumloop Integration
GUMLOOP_API_KEY=your_gumloop_key
GUMLOOP_USER_ID=your_user_id
GUMLOOP_SAVED_ITEM_ID=your_pipeline_id

# Optional
API_BASE_URL=http://localhost:3000  # For local development
NEXT_PUBLIC_SITE_URL=your_domain    # For OpenRouter attribution
```

## Key Improvements Over Original

### 1. Agentic AI Queries
**Old**: Hardcoded queries like "What are the best subreddits for X?"
**New**: AI generates intelligent, varied queries based on context

### 2. Real Reddit Validation  
**Old**: Mocked subscriber counts
**New**: Real Reddit API with actual subscriber data for Gumloop

### 3. Modular Architecture
**Old**: 554-line monolithic file
**New**: Clean separation of concerns, testable components

### 4. Error Handling
**Old**: Basic try/catch
**New**: Comprehensive rate limiting, fallbacks, graceful degradation

### 5. Human-in-the-Loop
**Old**: Limited manual selection
**New**: Full selection API with preview capabilities

## Deployment Considerations

### Development
```bash
npm run dev  # Start Next.js development server
npx tsx scripts/subtext-v1.ts  # Run CLI
```

### Production
- All services run as single Next.js application
- API endpoints handle discovery services
- CLI script can be packaged separately if needed

### Scaling
- Each service component can be independently optimized
- Rate limiting built-in for external APIs
- Caching can be added at service level
- Health checks available for monitoring

## Future Enhancements

### Phase 4: Human-in-the-Loop Flow
- Web-based selection interface
- Subreddit filtering and sorting
- Selection persistence and sharing

### Phase 5: Advanced Features
- Subreddit similarity analysis
- Historical performance tracking  
- Community culture analysis
- Engagement strategy recommendations

## Migration from Python

### What's Preserved
- All core functionality
- Gumloop integration
- User workflow and experience
- Database schema and tracking

### What's Improved
- Real Reddit API validation
- Agentic AI capabilities
- Modular, maintainable code
- Better error handling
- TypeScript type safety

### What's Removed
- Python dependencies
- Hardcoded query limitations
- Mocked Reddit data
- Monolithic architecture

---

**Last Updated**: January 19, 2025  
**Status**: Production Ready  
**Next Steps**: Phase 4 implementation