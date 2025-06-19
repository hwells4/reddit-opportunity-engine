# Discovery Service Refactor Plan

## Overview
Refactor the monolithic TypeScript discovery endpoint into a proper modular system with real Reddit validation, agentic AI queries, and human-in-the-loop selection.

## Tasks

### Phase 1: Core Infrastructure ✅
- [x] **Task 1.1**: Create modular library structure in `/lib/discovery/`
- [x] **Task 1.2**: Build real Reddit validation service using Reddit JSON API
- [x] **Task 1.3**: Fix OpenRouter client naming and configuration
- [x] **Task 1.4**: Create discovery orchestrator service

### Phase 2: Agentic AI Services ✅
- [x] **Task 2.1**: Build Perplexity service with intelligent query generation
- [x] **Task 2.2**: Build Firecrawl service with intelligent search strategies
- [x] **Task 2.3**: Create AI analysis service for subreddit categorization
- [x] **Task 2.4**: Add fallback mechanisms for when external services fail

### Phase 3: API Endpoints ✅
- [x] **Task 3.1**: Create `/api/discover` endpoint (orchestrator)
- [x] **Task 3.2**: Create `/api/discover/validate` endpoint for Reddit validation
- [x] **Task 3.3**: Create `/api/discover/select` endpoint for human selection
- [x] **Task 3.4**: Remove old monolithic discovery endpoint

### Phase 4: Human-in-the-Loop Flow
- [ ] **Task 4.1**: Design selection flow (candidates → human choice → final list)
- [ ] **Task 4.2**: Add subreddit filtering and sorting capabilities
- [ ] **Task 4.3**: Create selection persistence (save user choices)
- [ ] **Task 4.4**: Integration with existing Gumloop workflow

### Phase 5: Testing & Cleanup
- [ ] **Task 5.1**: Test each service independently
- [ ] **Task 5.2**: Test full discovery flow end-to-end
- [ ] **Task 5.3**: Update Python MVP to use new TypeScript endpoints
- [ ] **Task 5.4**: Remove redundant Python discovery code

## Key Requirements

### Reddit Validation
- Use `https://www.reddit.com/r/{subreddit}/about.json`
- Extract: subscribers, description, over_18, public_description
- Handle rate limiting and errors gracefully
- Return standardized subreddit info format

### Agentic AI Queries
- **Perplexity**: Let it generate intelligent search strategies
- **Firecrawl**: Allow dynamic query formulation based on context
- **No hardcoded prompts** - let the AI be creative
- Provide context, let AI decide best approach

### Human Selection Flow
1. Discovery finds candidates
2. Present candidates with metadata (subscribers, description, relevance)
3. Human selects which subreddits to analyze
4. Selected subreddits proceed to Gumloop analysis

### Modular Structure
```
lib/discovery/
├── types.ts              # Shared interfaces
├── reddit-validator.ts   # Real Reddit API validation
├── perplexity.ts         # Agentic Perplexity queries
├── firecrawl.ts          # Agentic Firecrawl search
├── ai-analysis.ts        # OpenRouter analysis/categorization
├── orchestrator.ts       # Main discovery logic
└── index.ts              # Exports

app/api/discover/
├── route.ts              # Main discovery endpoint
├── validate/route.ts     # Reddit validation endpoint
└── select/route.ts       # Human selection endpoint
```

## Success Criteria
- [ ] Modular, testable code structure
- [ ] Real Reddit subscriber counts for Gumloop
- [ ] Agentic AI queries (not hardcoded)
- [ ] Human selection capability
- [ ] Integration with existing workflow
- [ ] All Python functionality preserved in TypeScript

---

**Status**: Planning Complete ✅  
**Next**: Start Phase 1 tasks