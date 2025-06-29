/**
 * API route for running a matrix of A/B tests on the search pipeline.
 * This is a powerful developer and testing tool designed to systematically evaluate
 * the performance of different search configurations. It is not a standard
 * user-facing endpoint.
 *
 * - POST /api/test/search-matrix:
 *   Accepts a standard `SearchRequest` body and a series of `X-Test-*` headers
 *   that define the parameters for the test matrix (e.g., search strategies,
 *   embedding models, engagement thresholds).
 *
 *   The endpoint's workflow is as follows:
 *   1.  **Generate Matrix**: Creates a comprehensive list of all possible test
 *       configurations by combining the parameters provided in the headers.
 *   2.  **Execute Tests**: Iterates through each configuration, calling the main
 *       `/api/search` endpoint with specific headers to trigger the desired
 *       behavior for that test run. Tests are run in parallel with a
 *       concurrency limit.
 *   3.  **Measure Performance**: For each test, it captures key metrics such as
 *       latency, cost, API calls, and, most importantly, the relevance rate
 *       of the results.
 *   4.  **Analyze & Summarize**: After all tests complete, it analyzes the
 *       aggregated results to identify the best-performing configurations and
 *       generates actionable recommendations (e.g., "Optimal engagement
 *       threshold: 5").
 *
 *   This endpoint enables data-driven optimization of the search pipeline, helping
 *   to find the best balance between result quality, cost, and latency.
 */
import { NextRequest, NextResponse } from 'next/server';
import { SearchRequest, SearchResponse } from '../../search/types';
import { TestExecutor } from '../../../../lib/search/test-executor';

// Matrix testing configuration types
export interface TestConfiguration {
  strategy: 'sitewide' | 'subreddit' | 'flair' | 'author' | 'multi';
  embedProvider: 'openai' | 'bge' | 'miniLM';
  engagementThreshold: number;
  promptVariant: 'current' | 'enhanced' | 'gummy-inspired';
  oversampleFactor: number;
  maxPosts: number;
}

export interface MatrixTestResult {
  config: TestConfiguration;
  result: SearchResponse;
  performance: {
    latencyMs: number;
    relevanceRate: number;
    costUSD: number;
    apiCalls: number;
  };
  classificationBreakdown: {
    highValue: number;
    moderateValue: number;
    lowValue: number;
    irrelevant: number;
    totalClassified: number;
  };
}

export interface MatrixTestResponse {
  testRunId: string;
  baselineQuery: {
    audience: string;
    questions: string[];
  };
  totalConfigurations: number;
  completedTests: number;
  failedTests: number;
  results: MatrixTestResult[];
  summary: {
    bestPerformingConfig: TestConfiguration;
    worstPerformingConfig: TestConfiguration;
    averageRelevanceRate: number;
    totalCostUSD: number;
    recommendations: string[];
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse base search request
    const body = await request.json() as SearchRequest;
    
    // Extract test configuration from headers
    const testStrategies = parseHeaderArray(request.headers.get('X-Test-Strategies') || 'sitewide');
    const testEmbeddings = parseHeaderArray(request.headers.get('X-Test-Embeddings') || 'openai,bge,miniLM');
    const testThresholds = parseHeaderArray(request.headers.get('X-Test-Thresholds') || '5').map(Number);
    const testPrompts = parseHeaderArray(request.headers.get('X-Test-Prompts') || 'current');
    const testOversample = parseHeaderArray(request.headers.get('X-Test-Oversample') || '3,5,10,20').map(Number);
    
    // Validate required fields
    if (!body.audience || !body.questions || body.questions.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: audience and questions' },
        { status: 400 }
      );
    }
    
    // Generate test matrix
    const testConfigurations = generateTestMatrix({
      strategies: testStrategies,
      embeddings: testEmbeddings,
      thresholds: testThresholds,
      prompts: testPrompts,
      oversampleFactors: testOversample,
      maxPosts: body.maxPosts || 100
    });
    
    console.log(`[MatrixTest] Generated ${testConfigurations.length} test configurations`);
    
    // Execute tests using TestExecutor
    const executor = new TestExecutor();
    const results = await executor.executeBatch(testConfigurations, body);
    
    console.log(`[MatrixTest] Completed ${results.length}/${testConfigurations.length} tests`);
    
    // Analyze results and generate recommendations
    const analysis = analyzeResults(results);
    
    const response: MatrixTestResponse = {
      testRunId: `matrix_${Date.now()}`,
      baselineQuery: {
        audience: body.audience,
        questions: body.questions
      },
      totalConfigurations: testConfigurations.length,
      completedTests: results.length,
      failedTests: testConfigurations.length - results.length,
      results: results.sort((a, b) => b.performance.relevanceRate - a.performance.relevanceRate),
      summary: analysis
    };
    
    console.log(`[MatrixTest] Completed ${results.length}/${testConfigurations.length} tests in ${Date.now() - startTime}ms`);
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Matrix test error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Parse comma-separated header values
 */
function parseHeaderArray(headerValue: string): string[] {
  return headerValue.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Generate all combinations of test parameters
 */
function generateTestMatrix(params: {
  strategies: string[];
  embeddings: string[];
  thresholds: number[];
  prompts: string[];
  oversampleFactors: number[];
  maxPosts: number;
}): TestConfiguration[] {
  const configs: TestConfiguration[] = [];
  
  for (const strategy of params.strategies) {
    for (const embedding of params.embeddings) {
      for (const threshold of params.thresholds) {
        for (const prompt of params.prompts) {
          for (const oversample of params.oversampleFactors) {
            configs.push({
              strategy: strategy as any,
              embedProvider: embedding as any,
              engagementThreshold: threshold,
              promptVariant: prompt as any,
              oversampleFactor: oversample,
              maxPosts: params.maxPosts
            });
          }
        }
      }
    }
  }
  
  return configs;
}


/**
 * Analyze test results and generate recommendations
 */
function analyzeResults(results: MatrixTestResult[]): MatrixTestResponse['summary'] {
  if (results.length === 0) {
    return {
      bestPerformingConfig: {} as TestConfiguration,
      worstPerformingConfig: {} as TestConfiguration,
      averageRelevanceRate: 0,
      totalCostUSD: 0,
      recommendations: ['No successful tests completed']
    };
  }
  
  // Sort by relevance rate
  const sortedByRelevance = [...results].sort((a, b) => b.performance.relevanceRate - a.performance.relevanceRate);
  const bestConfig = sortedByRelevance[0];
  const worstConfig = sortedByRelevance[sortedByRelevance.length - 1];
  
  // Calculate averages
  const averageRelevanceRate = results.reduce((sum, r) => sum + r.performance.relevanceRate, 0) / results.length;
  const totalCostUSD = results.reduce((sum, r) => sum + r.performance.costUSD, 0);
  
  // Use TestExecutor's advanced analysis
  const detailedAnalysis = TestExecutor.analyzeBatchResults(results);
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  // Strategy analysis
  const bestStrategy = Object.entries(detailedAnalysis.byStrategy)
    .sort((a, b) => b[1].avgRelevance - a[1].avgRelevance)[0];
  
  if (bestStrategy) {
    recommendations.push(`Best performing strategy: ${bestStrategy[0]} (${(bestStrategy[1].avgRelevance * 100).toFixed(1)}% relevance rate)`);
  }
  
  // Embedding analysis
  const bestEmbedding = Object.entries(detailedAnalysis.byEmbedding)
    .sort((a, b) => b[1].avgRelevance - a[1].avgRelevance)[0];
  
  if (bestEmbedding) {
    recommendations.push(`Best embedding model: ${bestEmbedding[0]} (${(bestEmbedding[1].avgRelevance * 100).toFixed(1)}% relevance, $${bestEmbedding[1].avgCost.toFixed(4)} avg cost)`);
  }
  
  // Threshold analysis
  const optimalThreshold = Object.entries(detailedAnalysis.byThreshold)
    .sort((a, b) => b[1].avgRelevance - a[1].avgRelevance)[0];
  
  if (optimalThreshold) {
    recommendations.push(`Optimal engagement threshold: ${optimalThreshold[0]} (${(optimalThreshold[1].avgRelevance * 100).toFixed(1)}% relevance rate)`);
  }
  
  // Prompt variant analysis
  const bestPrompt = Object.entries(detailedAnalysis.byPrompt)
    .sort((a, b) => b[1].avgRelevance - a[1].avgRelevance)[0];
  
  if (bestPrompt) {
    recommendations.push(`Best prompt variant: ${bestPrompt[0]} (${(bestPrompt[1].avgRelevance * 100).toFixed(1)}% relevance rate)`);
  }
  
  // Cost efficiency analysis
  const costEfficient = results
    .filter(r => r.performance.relevanceRate > averageRelevanceRate * 0.8) // Within 80% of average relevance
    .sort((a, b) => a.performance.costUSD - b.performance.costUSD)[0]; // Lowest cost
  
  if (costEfficient && costEfficient !== bestConfig) {
    recommendations.push(`Most cost-efficient config: ${JSON.stringify(costEfficient.config)} ($${costEfficient.performance.costUSD.toFixed(4)}, ${(costEfficient.performance.relevanceRate * 100).toFixed(1)}% relevance)`);
  }
  
  return {
    bestPerformingConfig: bestConfig.config,
    worstPerformingConfig: worstConfig.config,
    averageRelevanceRate,
    totalCostUSD,
    recommendations
  };
}

