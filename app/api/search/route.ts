/**
 * API route for the core Reddit search pipeline. This is a complex endpoint that
 * orchestrates a multi-stage data processing funnel to find, filter, hydrate,
 * and classify Reddit posts based on a user's query. It is designed to be
 * cost-aware, observable, and ready for A/B testing.
 *
 * - POST /api/search:
 *   Accepts a `SearchRequest` body with `audience` and `questions`.
 *   It also reads `X-Test-*` headers to allow for matrix testing of different
 *   pipeline configurations (e.g., oversampling factors).
 *
 *   The pipeline follows a sequential, multi-stage process:
 *   1.  **Keyword Expansion**: Expands the user's query into concrete search terms.
 *   2.  **Reddit Bulk Search**: Fetches a large, oversampled set of posts from Reddit
 *       using a pool of workers for concurrency.
 *   3.  **Post Processing**: Cleans and standardizes the raw post data.
 *   4.  **Embedding Prune**: A crucial first-pass filter. It uses vector embeddings
 *       to find semantically relevant posts, drastically reducing the volume of
 *       data before the expensive LLM stage.
 *   5.  **Post Hydration**: Fetches the full text and comments for the posts that
 *       passed the embedding prune, providing rich context for classification.
 *   6.  **LLM Gate**: The final, high-precision filter. A powerful LLM classifies
 *       the hydrated posts, keeping only the most valuable ones.
 *
 *   Throughout the process, a `CostMeter` tracks API and token costs, and a
 *   `SearchDatabase` service logs the run and its results for traceability. The
 *   final response includes the classified posts and detailed performance stats.
 */
import { NextRequest, NextResponse } from 'next/server';
import { SearchRequest, SearchResponse, SearchStats } from './types';

// Default configuration values from PRD
const DEFAULT_MAX_POSTS = 1000;
const DEFAULT_AGE_DAYS = 90;
const DEFAULT_MIN_SCORE = 2;
const DEFAULT_EMBED_PROVIDER = 'openai';
const DEFAULT_PREMIUM = false;
const DEFAULT_STORE_VECTORS = false;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse and validate request body
    const body = await request.json() as SearchRequest;
    
    // Parse test configuration headers for matrix testing support
    const testHeaders = {
      strategy: request.headers.get('X-Test-Strategy') || 'sitewide',
      promptVariant: request.headers.get('X-Test-Prompt-Variant') || 'current',
      engagementThreshold: parseFloat(request.headers.get('X-Test-Engagement-Threshold') || process.env.SUBTEXT_ENGAGE_THRESH || '5'),
      oversampleFactor: parseInt(request.headers.get('X-Test-Oversample') || process.env.SUBTEXT_OVERSAMPLE || '20')
    };
    
    // Validate required fields
    if (!body.audience || typeof body.audience !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid audience parameter' },
        { status: 400 }
      );
    }
    
    if (!body.questions || !Array.isArray(body.questions) || body.questions.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid questions parameter' },
        { status: 400 }
      );
    }
    
    // Apply defaults
    const searchParams = {
      audience: body.audience,
      questions: body.questions,
      maxPosts: body.maxPosts ?? DEFAULT_MAX_POSTS,
      ageDays: body.ageDays ?? DEFAULT_AGE_DAYS,
      minScore: body.minScore ?? DEFAULT_MIN_SCORE,
      embedProvider: body.embedProvider ?? DEFAULT_EMBED_PROVIDER,
      premium: body.premium ?? DEFAULT_PREMIUM,
      storeVectors: body.storeVectors ?? DEFAULT_STORE_VECTORS
    };
    
    // Validate constraints
    if (searchParams.maxPosts < 1 || searchParams.maxPosts > 10000) {
      return NextResponse.json(
        { error: 'maxPosts must be between 1 and 10000' },
        { status: 400 }
      );
    }
    
    // Generate run ID as UUID
    const { v4: uuidv4 } = await import('uuid');
    const runId = uuidv4();
    
    // Log test configuration if any test headers are present
    if (request.headers.get('X-Test-Strategy') || request.headers.get('X-Test-Prompt-Variant') || 
        request.headers.get('X-Test-Engagement-Threshold') || request.headers.get('X-Test-Oversample')) {
      console.log(`[${runId}] Test configuration:`, testHeaders);
    }
    
    // Check for X-Subtext-Run header for run linking (FR-9)
    const subtextRunId = request.headers.get('X-Subtext-Run');
    
    // Import database module
    const { SearchDatabase } = await import('../../../lib/search/database');
    const db = new SearchDatabase();
    
    // Create search run record
    const createResult = await db.createSearchRun({
      runId,
      searchParams,
      accountId: subtextRunId || undefined
    });
    
    if (!createResult.success) {
      console.error('Failed to create search run:', createResult.error);
      // Continue anyway - we don't want to fail the search just because of DB issues
    }
    
    // Initialize stats tracking
    const stats: SearchStats = {
      rawFetched: 0,
      afterEmbed: 0,
      afterGate: 0,
      apiCalls: 0,
      tokenCostUSD: 0,
      elapsedSec: 0
    };
    
    // Import pipeline components
    const { KeywordQueryBuilder } = await import('../../../lib/search/keyword-query-builder');
    const { RedditBulkSearch } = await import('../../../lib/search/reddit-bulk-search');
    const { PostProcessor } = await import('../../../lib/search/post-processor');
    const { WorkerPoolFactory } = await import('../../../lib/search/worker-pool');
    
    // Stage 1: Build keyword queries
    console.log(`[${runId}] Starting keyword expansion...`);
    const keywordBuilder = new KeywordQueryBuilder();
    const keywordAtoms = await keywordBuilder.buildKeywordAtoms({
      audience: searchParams.audience,
      questions: searchParams.questions
    });
    const searchQueries = keywordBuilder.buildSearchQueries(keywordAtoms);
    console.log(`[${runId}] Generated ${searchQueries.length} search queries from ${keywordAtoms.length} keyword atoms`);
    console.log(`[${runId}] Sample queries:`, searchQueries.slice(0, 5));
    console.log(`[${runId}] Keyword atoms:`, keywordAtoms.slice(0, 5));
    
    // Stage 2: Reddit bulk search with worker pool
    console.log(`[${runId}] Starting Reddit search...`);
    // TODO: Implement MultiStrategySearchExecutor based on testHeaders.strategy
    // For now, using existing single-strategy search
    const redditSearch = new RedditBulkSearch(searchParams.premium);
    const searchWorkerPool = WorkerPoolFactory.createSearchPool(
      parseInt(process.env.SUBTEXT_WORKERS_SEARCH || '16')
    );
    
    const bulkSearchResult = await redditSearch.bulkSearch({
      queries: searchQueries,
      ageDays: searchParams.ageDays,
      minScore: searchParams.minScore,
      premium: searchParams.premium,
      maxResultsPerQuery: Math.ceil(searchParams.maxPosts * 3) // Oversample for later filtering
    });
    
    stats.rawFetched = bulkSearchResult.stats.totalFetched;
    stats.apiCalls = bulkSearchResult.stats.apiCalls;
    
    // Stage 3: Post processing and truncation
    console.log(`[${runId}] Processing ${bulkSearchResult.posts.length} posts...`);
    const processedPosts = PostProcessor.processPosts(bulkSearchResult.posts);
    
    // TODO: Implement EngagementPreFilter here based on testHeaders.engagementThreshold
    // This will reduce the number of posts before expensive embedding processing
    
    // Import additional components
    const { EmbeddingPrune } = await import('../../../lib/search/embedding-prune');
    const { PostHydrator } = await import('../../../lib/search/post-hydrator');
    const { LLMGate } = await import('../../../lib/search/llm-gate');
    const { CostMeter } = await import('../../../lib/search/cost-meter');
    
    // Initialize cost tracking
    const costMeter = new CostMeter();
    
    // Track Reddit API costs
    costMeter.trackRedditCalls(bulkSearchResult.stats.apiCalls, searchParams.premium);
    
    // Stage 4: Embedding prune
    console.log(`[${runId}] Starting embedding prune...`);
    const embeddingPrune = new EmbeddingPrune();
    const embeddingWorkerPool = WorkerPoolFactory.createEmbedPool(
      parseInt(process.env.SUBTEXT_WORKERS_EMBED || '32')
    );
    
    // Dynamic oversample factor based on post count (use test header if provided)
    const baseOversample = testHeaders.oversampleFactor;
    const dynamicOversample = processedPosts.length < 100 
      ? Math.max(baseOversample, Math.floor(processedPosts.length / searchParams.maxPosts))
      : baseOversample;
    
    console.log(`[${runId}] Using oversample factor: ${dynamicOversample} (${processedPosts.length} posts available)`);
    
    const embeddingResult = await embeddingPrune.prunePosts(processedPosts, {
      provider: searchParams.embedProvider || 'openai',
      questions: searchParams.questions,
      maxPosts: searchParams.maxPosts,
      oversampleFactor: dynamicOversample,
      truncateLength: parseInt(process.env.SUBTEXT_EMBED_TRUNC || '2000')
    });
    
    stats.afterEmbed = embeddingResult.posts.length;
    costMeter.trackOpenAIEmbeddings(embeddingResult.stats.tokensUsed);
    
    // Stage 5: Post hydration (fetch full content + comments)
    console.log(`[${runId}] Starting post hydration...`);
    const postHydrator = new PostHydrator(searchParams.premium);
    
    const hydrationResult = await postHydrator.hydratePosts(embeddingResult.posts, {
      maxComments: 100,
      maxDepth: 3,
      minCommentScore: 1,
      concurrency: 8,
      premium: searchParams.premium
    });
    
    console.log(`[${runId}] Hydrated ${hydrationResult.stats.successfulHydrations}/${hydrationResult.stats.inputPosts} posts, fetched ${hydrationResult.stats.totalCommentsFetched} comments`);
    
    // Track Reddit API costs for comment fetching
    costMeter.trackRedditCalls(hydrationResult.stats.totalApiCalls, searchParams.premium);
    
    // Stage 6: Enhanced LLM classification
    console.log(`[${runId}] Starting enhanced LLM classification...`);
    const llmGate = new LLMGate();
    
    const gateResult = await llmGate.filterPosts(hydrationResult.posts, {
      questions: searchParams.questions,
      audience: searchParams.audience,
      concurrency: parseInt(process.env.SUBTEXT_WORKERS_FLASH || '15'), // Reduced for complex analysis
      includeComments: true,
      maxContentLength: 8000
    });
    
    stats.afterGate = gateResult.posts.length;
    costMeter.trackGeminiTokens(
      gateResult.stats.tokensUsed || gateResult.stats.apiCalls * 500, // Increased estimate for comprehensive analysis
      gateResult.stats.apiCalls * 50 // Increased for classification explanations
    );
    
    // Update final stats
    stats.tokenCostUSD = costMeter.getTotalCost();
    
    const response: SearchResponse = {
      runId,
      posts: gateResult.posts,
      stats: {
        ...stats,
        elapsedSec: (Date.now() - startTime) / 1000,
        classifications: {
          highValue: gateResult.stats.highValue,
          moderateValue: gateResult.stats.moderateValue,
          lowValue: gateResult.stats.lowValue,
          irrelevant: gateResult.stats.irrelevant
        },
        hydration: {
          successfulHydrations: hydrationResult.stats.successfulHydrations,
          failedHydrations: hydrationResult.stats.failedHydrations,
          totalCommentsFetched: hydrationResult.stats.totalCommentsFetched
        }
      }
    };
    
    // Log comprehensive results
    console.log(`[${runId}] Search complete:\n${costMeter.getSummary()}`);
    console.log(`[${runId}] Pipeline: ${stats.rawFetched} → ${stats.afterEmbed} → ${hydrationResult.stats.successfulHydrations} hydrated → ${stats.afterGate} classified`);
    console.log(`[${runId}] Classifications: ${gateResult.stats.highValue} HIGH, ${gateResult.stats.moderateValue} MODERATE, ${gateResult.stats.lowValue} LOW, ${gateResult.stats.irrelevant} IRRELEVANT`);
    console.log(`[${runId}] Comments fetched: ${hydrationResult.stats.totalCommentsFetched}`);
    console.log(`[${runId}] Cost per result: $${costMeter.getCostPerPost(gateResult.posts.length).toFixed(4)}`);
    
    // Save posts to database if run ID is linked
    if (subtextRunId || searchParams.storeVectors) {
      console.log(`[${runId}] Saving ${gateResult.posts.length} posts to database...`);
      const saveResult = await db.savePosts(gateResult.posts, subtextRunId || runId);
      console.log(`[${runId}] Database save: ${saveResult.saved} saved, ${saveResult.errors} errors`);
    }
    
    // Update search run with completion data
    await db.completeSearchRun(runId, stats, costMeter.getCosts());
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}