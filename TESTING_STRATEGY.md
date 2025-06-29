# Testing Strategy for Search Pipeline & A/B Testing Framework

## Overview
Comprehensive testing strategy for the enhanced search pipeline to support 50+ A/B testing experiments with confidence and rapid iteration.

## Core Testing Requirements

### 1. Fast Execution (< 2 minutes total)
- **Unit tests**: < 30 seconds
- **Integration tests**: < 60 seconds  
- **End-to-end smoke tests**: < 30 seconds
- **Total runtime**: < 2 minutes for pre-commit hooks

### 2. Critical Test Coverage Areas

#### **Pipeline Stage Testing**
```
- RedditBulkSearch: API calls, rate limiting, data extraction
- PostProcessor: Text cleaning, truncation, snippet generation
- EmbeddingPrune: Semantic filtering, similarity scoring
- PostHydrator: Comment fetching, error handling
- LLMGate: 4-tier classification, prompt parsing
```

#### **A/B Testing Metrics Validation**
```
- Classification distribution tracking (HIGH/MODERATE/LOW/IRRELEVANT)
- Hydration statistics accuracy
- Cost calculation correctness
- Response format consistency
```

#### **Error Resilience Testing**
```
- API rate limit handling
- Malformed Reddit responses
- OpenAI/OpenRouter failures
- Database connection issues
- Partial pipeline failures
```

### 3. Test Implementation Strategy

#### **Mock-Based Unit Tests** (< 30s)
```typescript
// Example: PostHydrator unit test
describe('PostHydrator', () => {
  it('should fetch comments for filtered posts only', async () => {
    const mockPosts = generateMockPosts(10);
    const hydrator = new PostHydrator();
    
    // Mock Reddit API to track calls
    const apiSpy = jest.spyOn(hydrator, 'fetchPostComments');
    
    const result = await hydrator.hydratePosts(mockPosts);
    
    expect(apiSpy).toHaveBeenCalledTimes(10); // Not 100+ from all posts
    expect(result.stats.successfulHydrations).toBe(10);
  });
});
```

#### **Integration Tests with Test Data** (< 60s)
```typescript
// Example: Full pipeline test with canned data
describe('Search Pipeline Integration', () => {
  it('should process posts through complete pipeline', async () => {
    const testConfig = {
      audience: 'software developers',
      questions: ['How do they describe CI issues?'],
      maxPosts: 20
    };
    
    // Use pre-recorded Reddit responses
    mockRedditAPI(cannedSearchResults);
    mockOpenAI(cannedEmbeddings);
    mockGemini(cannedClassifications);
    
    const result = await searchAPI.POST(testConfig);
    
    expect(result.stats.classifications).toBeDefined();
    expect(result.stats.hydration).toBeDefined();
    expect(result.posts.length).toBeGreaterThan(0);
  });
});
```

#### **Performance Benchmark Tests**
```typescript
// Ensure pipeline stays within performance targets
describe('Performance Tests', () => {
  it('should complete 100-post pipeline in < 5 minutes', async () => {
    const startTime = Date.now();
    await runSearchPipeline({ maxPosts: 100 });
    const elapsed = Date.now() - startTime;
    
    expect(elapsed).toBeLessThan(5 * 60 * 1000); // 5 minutes
  });
});
```

### 4. A/B Testing Validation Suite

#### **Classification Distribution Tests**
```typescript
// Validate different search strategies produce different results
describe('A/B Testing Metrics', () => {
  it('should track classification distribution changes', async () => {
    const strategy1 = await runSearch({ embedProvider: 'openai', oversample: 3 });
    const strategy2 = await runSearch({ embedProvider: 'miniLM', oversample: 5 });
    
    // Results should be trackably different
    expect(strategy1.stats.classifications).not.toEqual(strategy2.stats.classifications);
    
    // But format should be consistent
    expect(strategy1.stats.classifications).toMatchSchema(classificationSchema);
    expect(strategy2.stats.classifications).toMatchSchema(classificationSchema);
  });
});
```

#### **Cost Tracking Validation**
```typescript
// Ensure cost calculations are accurate for budget planning
describe('Cost Tracking', () => {
  it('should accurately calculate costs across pipeline stages', async () => {
    const result = await runSearchPipeline();
    
    expect(result.stats.tokenCostUSD).toBeGreaterThan(0);
    expect(result.stats.tokenCostUSD).toBeLessThan(1.00); // Budget check
    
    // Should break down costs by stage
    expect(costMeter.getBreakdown()).toHaveProperty('redditAPI');
    expect(costMeter.getBreakdown()).toHaveProperty('openaiEmbeddings');
    expect(costMeter.getBreakdown()).toHaveProperty('geminiClassification');
  });
});
```

### 5. Test Data Strategy

#### **Canned Reddit Responses**
```
/tests/fixtures/
├── reddit-search-responses/
│   ├── programming-100-posts.json
│   ├── devops-50-posts.json
│   └── empty-results.json
├── reddit-comments/
│   ├── high-engagement-post.json
│   └── minimal-comments.json
└── ai-responses/
    ├── openai-embeddings.json
    └── gemini-classifications.json
```

#### **Test Configuration Matrix**
```yaml
# Different A/B test scenarios to validate
test_scenarios:
  - name: "baseline"
    config: { embedProvider: "openai", oversample: 3, maxComments: 50 }
  - name: "high_recall"  
    config: { embedProvider: "openai", oversample: 10, maxComments: 100 }
  - name: "cost_optimized"
    config: { embedProvider: "miniLM", oversample: 2, maxComments: 25 }
```

### 6. Pre-Commit Hook Integration

#### **Fast Gate Tests** (< 2 min total)
```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running search pipeline tests..."

# Unit tests (30s)
npm test -- --testPathPattern=unit --maxWorkers=4

# Integration tests (60s)  
npm test -- --testPathPattern=integration --maxWorkers=2

# Quick smoke test (30s)
npm run test:smoke

echo "All tests passed! ✅"
```

### 7. Continuous Integration Strategy

#### **PR Testing Pipeline**
```yaml
# GitHub Actions workflow
name: Search Pipeline Tests
on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
        
      - name: Run comprehensive tests
        run: |
          npm run test:unit
          npm run test:integration  
          npm run test:performance
          npm run test:ab-metrics
        
      - name: Generate test report
        run: npm run test:coverage
```

### 8. Testing Tools & Framework

#### **Recommended Stack**
- **Test Runner**: Jest (already used in project)
- **API Mocking**: MSW (Mock Service Worker)
- **Performance Testing**: Built-in Node.js performance hooks
- **Coverage**: Jest built-in coverage
- **Test Data**: JSON fixtures + factory pattern

#### **Mock Strategy**
```typescript
// Centralized mocking for consistent test behavior
export const mockRedditAPI = (responses: RedditResponse[]) => {
  server.use(
    rest.get('https://www.reddit.com/search.json', (req, res, ctx) => {
      return res(ctx.json(responses[0]));
    })
  );
};
```

### 9. Test Metrics & Monitoring

#### **Quality Gates**
- **Code Coverage**: > 80% for pipeline components
- **Performance**: < 5 min for 1000 posts
- **Cost**: < $0.01 per result post
- **Classification Distribution**: Reasonable spread across tiers

#### **A/B Testing Confidence**
- **Reproducibility**: Same config = same results (±5%)
- **Sensitivity**: Different configs = measurably different results
- **Format Consistency**: All responses match API schema

## Implementation Priority

### Phase 1: Core Pipeline Tests (Week 1)
1. Unit tests for each pipeline stage
2. Integration test with mocked APIs
3. Pre-commit hook setup

### Phase 2: A/B Testing Validation (Week 2)  
1. Classification distribution tests
2. Cost tracking validation
3. Performance benchmarks

### Phase 3: Advanced Testing (Week 3)
1. Error resilience testing
2. Load testing with large datasets
3. CI/CD pipeline integration

## Benefits for 50 A/B Experiments

1. **Confidence**: Every experiment runs on tested infrastructure
2. **Speed**: 2-minute test suite doesn't slow development
3. **Reliability**: Comprehensive error handling prevents failed experiments
4. **Metrics**: Validated classification tracking enables accurate comparisons
5. **Cost Control**: Budget monitoring prevents expensive mistakes

This testing strategy ensures your A/B testing framework is rock-solid for rapid iteration across 50 different search strategies.