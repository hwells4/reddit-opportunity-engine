import { SearchPost } from '../../app/api/search/types';
import { HydratedPost, PostHydrator } from './post-hydrator';
import { getValidatedApiKey } from '../../utils/api-key-validation';
import { WorkerPool, WorkerTask } from './worker-pool';

// 4-tier classification values
export type ClassificationTier = 'HIGH_VALUE' | 'MODERATE_VALUE' | 'LOW_VALUE' | 'IRRELEVANT';

export interface LLMGateOptions {
  questions: string[];
  audience: string;
  concurrency?: number;
  includeComments?: boolean;
  maxContentLength?: number;
}

export interface LLMGateResult {
  posts: HydratedPost[];
  stats: {
    inputPosts: number;
    outputPosts: number;
    highValue: number;
    moderateValue: number;
    lowValue: number;
    irrelevant: number;
    apiCalls: number;
    tokensUsed: number;
    cost: number;
  };
}

interface GateCheckResult {
  postId: string;
  classification: ClassificationTier;
  explanation?: string;
  error?: string;
}

export class LLMGate {
  private static readonly OPENROUTER_MODEL = 'google/gemini-2.5-flash';
  private static readonly OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
  private static readonly DEFAULT_CONCURRENCY = 32;
  
  // Gemini 2.5 Flash via OpenRouter: Paid tier
  private static readonly GEMINI_INPUT_COST = 0.0000003; // $0.30 per 1M input tokens
  private static readonly GEMINI_OUTPUT_COST = 0.0000025; // $2.50 per 1M output tokens
  
  private apiKey?: string;
  
  constructor() {
    this.apiKey = getValidatedApiKey('OPENROUTER_API_KEY') || undefined;
  }
  
  /**
   * Filter posts using Gemini Flash 4-tier classification
   * Enhanced: HIGH_VALUE, MODERATE_VALUE, LOW_VALUE, IRRELEVANT with full content analysis
   */
  async filterPosts(posts: HydratedPost[], options: LLMGateOptions): Promise<LLMGateResult> {
    const stats = {
      inputPosts: posts.length,
      outputPosts: 0,
      highValue: 0,
      moderateValue: 0,
      lowValue: 0,
      irrelevant: 0,
      apiCalls: 0,
      tokensUsed: 0,
      cost: 0
    };
    
    if (!this.apiKey) {
      console.warn('OpenRouter API key not available, returning all posts');
      return {
        posts,
        stats: { ...stats, outputPosts: posts.length }
      };
    }
    
    if (posts.length === 0) {
      return { posts: [], stats };
    }
    
    // Create worker pool for concurrent processing
    const concurrency = options.concurrency || LLMGate.DEFAULT_CONCURRENCY;
    const workerPool = new WorkerPool<HydratedPost, GateCheckResult>(
      async (post) => this.checkPost(post, options, stats),
      {
        name: 'llm-gate-enhanced',
        concurrency: Math.min(concurrency, 15), // Reduced for more complex analysis
        taskTimeout: 45000, // 45s timeout for comprehensive analysis
        retryAttempts: 3,
        retryDelay: 2000
      }
    );
    
    // Add all posts as tasks
    const tasks: WorkerTask<HydratedPost, GateCheckResult>[] = posts.map(post => ({
      id: post.id,
      data: post,
      priority: post.score // Higher score posts get priority
    }));
    
    await workerPool.addBatch(tasks);
    
    // Wait for all tasks to complete
    await workerPool.waitForIdle();
    
    // Collect results
    const results = workerPool.getResults();
    const classifiedPosts: HydratedPost[] = [];
    
    for (const result of results) {
      if (!result.error && result.result?.classification) {
        const post = posts.find(p => p.id === result.result?.postId);
        if (post) {
          // Add classification metadata to post
          (post as any).classification = result.result.classification;
          (post as any).classificationExplanation = result.result.explanation;
          
          // Update statistics
          switch (result.result.classification) {
            case 'HIGH_VALUE':
              stats.highValue++;
              classifiedPosts.push(post);
              break;
            case 'MODERATE_VALUE':
              stats.moderateValue++;
              classifiedPosts.push(post);
              break;
            case 'LOW_VALUE':
              stats.lowValue++;
              classifiedPosts.push(post);
              break;
            case 'IRRELEVANT':
              stats.irrelevant++;
              // Don't include irrelevant posts in output
              break;
          }
        }
      }
    }
    
    stats.outputPosts = classifiedPosts.length;
    
    console.log(`[LLMGate] Classification complete: ${stats.highValue} HIGH, ${stats.moderateValue} MODERATE, ${stats.lowValue} LOW, ${stats.irrelevant} IRRELEVANT`);
    
    return {
      posts: classifiedPosts,
      stats
    };
    
    // Shutdown worker pool
    await workerPool.shutdown();
    
    // Calculate cost based on token usage
    const estimatedInputTokens = stats.apiCalls * 500; // Increased for comprehensive prompts
    const estimatedOutputTokens = stats.apiCalls * 50; // Increased for classification explanations
    stats.cost = (estimatedInputTokens * LLMGate.GEMINI_INPUT_COST) + 
                 (estimatedOutputTokens * LLMGate.GEMINI_OUTPUT_COST);
    
    return {
      posts: classifiedPosts,
      stats
    };
  }
  
  /**
   * Classify a single post using enhanced 4-tier system
   */
  private async checkPost(
    post: HydratedPost,
    options: LLMGateOptions,
    stats: { apiCalls: number; tokensUsed: number }
  ): Promise<GateCheckResult> {
    const prompt = this.buildEnhancedPrompt(post, options);
    
    try {
      const response = await fetch(
        `${LLMGate.OPENROUTER_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://reddit-opportunity-engine.com',
            'X-Title': 'Reddit Search API'
          },
          body: JSON.stringify({
            model: LLMGate.OPENROUTER_MODEL,
            messages: [{
              role: 'user',
              content: prompt
            }],
            temperature: 0, // Consistency for classification
            max_tokens: 100, // Allow for classification + brief explanation
            top_p: 1,
            stream: false
          })
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error ${response.status}: ${error}`);
      }
      
      const data = await response.json();
      stats.apiCalls++;
      
      // Extract classification response
      const responseText = data.choices?.[0]?.message?.content?.trim() || '';
      const classification = this.parseClassification(responseText);
      const explanation = this.extractExplanation(responseText);
      
      // Log first few decisions for debugging
      if (stats.apiCalls <= 5) {
        console.log(`[LLMGate] Post "${post.title?.substring(0, 50)}..." → ${classification} ${explanation ? '(' + explanation.substring(0, 100) + '...)' : ''}`);
      }
      
      // Update token count if available
      if (data.usage) {
        stats.tokensUsed += (data.usage.prompt_tokens || 0) + 
                           (data.usage.completion_tokens || 0);
      }
      
      return {
        postId: post.id,
        classification,
        explanation
      };
      
    } catch (error) {
      console.error(`Error checking post ${post.id}:`, error);
      return {
        postId: post.id,
        classification: 'IRRELEVANT',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Parse classification from response text
   */
  private parseClassification(responseText: string): ClassificationTier {
    const text = responseText.toUpperCase();
    
    if (text.includes('HIGH_VALUE') || text.includes('HIGH VALUE')) {
      return 'HIGH_VALUE';
    } else if (text.includes('MODERATE_VALUE') || text.includes('MODERATE VALUE')) {
      return 'MODERATE_VALUE';
    } else if (text.includes('LOW_VALUE') || text.includes('LOW VALUE')) {
      return 'LOW_VALUE';
    } else {
      return 'IRRELEVANT';
    }
  }
  
  /**
   * Extract explanation from response text
   */
  private extractExplanation(responseText: string): string | undefined {
    // Look for explanation after classification
    const lines = responseText.split('\n');
    if (lines.length > 1) {
      return lines.slice(1).join(' ').trim();
    }
    
    // Or look for explanation in parentheses or after dash
    const explanationMatch = responseText.match(/(?:\(([^)]+)\)|[-–](.+))$/);
    if (explanationMatch) {
      return (explanationMatch[1] || explanationMatch[2])?.trim();
    }
    
    return undefined;
  }
  
  /**
   * Build enhanced classification prompt with full content analysis
   */
  private buildEnhancedPrompt(post: HydratedPost, options: LLMGateOptions): string {
    const questionsText = options.questions
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n');
    
    // Prepare full content with comments
    const maxContentLength = options.maxContentLength || 8000;
    let fullContent = `Title: ${post.title}\n\nPost: ${post.fullSelfText || post.selfText || 'No content'}`;
    
    // Add comments if available and requested
    if (options.includeComments !== false && post.comments.length > 0) {
      const commentText = PostHydrator.getCommentText(post.comments, maxContentLength - fullContent.length);
      if (commentText) {
        fullContent += `\n\nComments:\n${commentText}`;
      }
    }
    
    // Truncate if too long
    if (fullContent.length > maxContentLength) {
      fullContent = fullContent.substring(0, maxContentLength) + '...';
    }
    
    return `Classify this Reddit post's relevance to understanding ${options.audience} and answering the research questions below.

Research Questions:
${questionsText}

Classification Options:
- HIGH_VALUE: Rich insights directly relevant to audience and questions, contains specific problems/solutions/opinions
- MODERATE_VALUE: Somewhat relevant with useful context, tangentially related but valuable
- LOW_VALUE: Minimally relevant, brief mentions or weak connections
- IRRELEVANT: Not related to audience or research questions

Content to Analyze:
${fullContent}

Classification:`;
  }
  
  /**
   * Batch classify multiple posts (future optimization)
   * Note: Currently processes individually for accuracy
   */
  private async batchClassifyPosts(
    posts: HydratedPost[],
    options: LLMGateOptions,
    stats: any
  ): Promise<GateCheckResult[]> {
    // For now, process individually for best classification accuracy
    const results: GateCheckResult[] = [];
    
    for (const post of posts) {
      const result = await this.checkPost(post, options, stats);
      results.push(result);
    }
    
    return results;
  }
}