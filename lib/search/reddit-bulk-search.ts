import { RedditPost, RedditSearchParams, SearchPost } from '../../app/api/search/types';
import { TokenBucketRateLimiter, getExponentialBackoff } from './rate-limiter';
import { getValidatedApiKey } from '../../utils/api-key-validation';

export interface BulkSearchOptions {
  queries: string[];
  ageDays: number;
  minScore: number;
  premium: boolean;
  maxResultsPerQuery?: number;
}

export interface BulkSearchResult {
  posts: SearchPost[];
  stats: {
    totalFetched: number;
    apiCalls: number;
    rateLimitHits: number;
    errors: number;
  };
}

export class RedditBulkSearch {
  private static readonly BASE_URL = 'https://www.reddit.com';
  private static readonly FREE_TIER_QPM = 90; // Queries per minute
  private static readonly ITEMS_PER_PAGE = 100; // Reddit max
  private rateLimiter: TokenBucketRateLimiter;
  private enterpriseKey?: string;
  
  constructor(premium: boolean = false) {
    // Initialize rate limiter based on tier
    this.rateLimiter = new TokenBucketRateLimiter(
      premium ? 1000 : RedditBulkSearch.FREE_TIER_QPM,
      premium ? 1000 : RedditBulkSearch.FREE_TIER_QPM
    );
    
    // Check for enterprise key if premium
    if (premium) {
      this.enterpriseKey = getValidatedApiKey('REDDIT_ENTERPRISE_KEY') || undefined;
    }
  }
  
  /**
   * Execute bulk search across multiple queries
   * FR-2: Page through results, respect age limit, throttle requests
   */
  async bulkSearch(options: BulkSearchOptions): Promise<BulkSearchResult> {
    const result: BulkSearchResult = {
      posts: [],
      stats: {
        totalFetched: 0,
        apiCalls: 0,
        rateLimitHits: 0,
        errors: 0
      }
    };
    
    const seenPostIds = new Set<string>();
    const ageThreshold = this.calculateAgeThreshold(options.ageDays);
    
    // Process each query
    for (const query of options.queries) {
      try {
        const queryPosts = await this.searchQuery({
          query,
          ageThreshold,
          minScore: options.minScore,
          maxResults: options.maxResultsPerQuery || 500,
          seenPostIds
        });
        
        result.posts.push(...queryPosts.posts);
        result.stats.totalFetched += queryPosts.stats.fetched;
        result.stats.apiCalls += queryPosts.stats.apiCalls;
        
      } catch (error) {
        console.error(`Error searching "${query}":`, error);
        result.stats.errors++;
      }
    }
    
    return result;
  }
  
  /**
   * Search a single query with pagination
   */
  private async searchQuery(params: {
    query: string;
    ageThreshold: number;
    minScore: number;
    maxResults: number;
    seenPostIds: Set<string>;
  }): Promise<{ posts: SearchPost[]; stats: { fetched: number; apiCalls: number } }> {
    const posts: SearchPost[] = [];
    const stats = { fetched: 0, apiCalls: 0 };
    let after: string | undefined;
    let tooOldFound = false;
    
    while (posts.length < params.maxResults && !tooOldFound) {
      // Wait for rate limit token
      await this.rateLimiter.acquire();
      
      try {
        const searchParams: RedditSearchParams = {
          q: params.query,
          sort: 'new', // FR-2: Sort by new for age filtering
          limit: RedditBulkSearch.ITEMS_PER_PAGE,
          after,
          restrict_sr: false,
          type: 'self' // Text posts only for now
        };
        
        const response = await this.makeSearchRequest(searchParams);
        stats.apiCalls++;
        
        if (!response.data?.children) {
          break;
        }
        
        // Process posts
        for (const child of response.data.children) {
          const post = child.data;
          
          // Check age threshold
          if (post.created_utc < params.ageThreshold) {
            tooOldFound = true;
            break;
          }
          
          // Check score threshold
          if (post.score < params.minScore) {
            continue;
          }
          
          // Skip if already seen
          if (params.seenPostIds.has(post.id)) {
            continue;
          }
          
          params.seenPostIds.add(post.id);
          posts.push(this.mapToSearchPost(post));
          stats.fetched++;
        }
        
        // Check if more pages available
        after = response.data.after;
        if (!after) {
          break;
        }
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('429')) {
          // Rate limit hit - wait and retry
          await this.handleRateLimit();
        } else {
          throw error;
        }
      }
    }
    
    return { posts, stats };
  }
  
  /**
   * Make HTTP request to Reddit search API
   */
  private async makeSearchRequest(params: RedditSearchParams, retryCount = 0): Promise<any> {
    const url = new URL(`${RedditBulkSearch.BASE_URL}/search.json`);
    
    // Add search parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
    
    const headers: HeadersInit = {
      'User-Agent': 'SubtextSearchBot/2.0 (Enhanced Search for Reddit Communities)',
      'Accept': 'application/json'
    };
    
    // Add enterprise key if available
    if (this.enterpriseKey) {
      headers['Authorization'] = `Bearer ${this.enterpriseKey}`;
    }
    
    try {
      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(15000) // 15s timeout
      });
      
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '60');
        throw new Error(`429: Rate limited for ${retryAfter}s`);
      }
      
      if (!response.ok) {
        throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
      
    } catch (error) {
      if (retryCount < 3 && error instanceof Error) {
        const delay = getExponentialBackoff(retryCount + 1);
        console.log(`Retrying after ${delay}ms (attempt ${retryCount + 1}/3)`);
        await this.delay(delay);
        return this.makeSearchRequest(params, retryCount + 1);
      }
      throw error;
    }
  }
  
  /**
   * Map Reddit post data to SearchPost format
   * FR-3: Truncate to 2000 chars, strip markup
   */
  private mapToSearchPost(post: any): SearchPost {
    const snippet = this.createSnippet(post.selftext || '');
    
    return {
      id: post.id,
      url: `https://reddit.com${post.permalink}`,
      score: post.score,
      createdUtc: post.created_utc,
      subreddit: post.subreddit,
      snippet,
      title: this.cleanTitle(post.title),
      // Extended fields for internal use
      selfText: post.selftext,
      authorFullname: post.author_fullname,
      numComments: post.num_comments
    };
  }
  
  /**
   * Create snippet from post text (FR-3)
   */
  private createSnippet(text: string): string {
    // Remove common markdown patterns
    let cleaned = text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) -> text
      .replace(/[*_~`]/g, '') // Remove formatting chars
      .replace(/^#+\s*/gm, '') // Remove headers
      .replace(/\n{3,}/g, '\n\n') // Normalize newlines
      .trim();
    
    // Truncate to first 2000 chars
    if (cleaned.length > 2000) {
      cleaned = cleaned.substring(0, 1997) + '...';
    }
    
    // Create snippet (first 200 chars for display)
    return cleaned.substring(0, 200).trim() + (cleaned.length > 200 ? '...' : '');
  }
  
  /**
   * Clean title text
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/\[([^\]]+)\]/g, '$1') // Remove brackets
      .replace(/[*_~`]/g, '') // Remove formatting
      .trim();
  }
  
  /**
   * Calculate age threshold timestamp
   */
  private calculateAgeThreshold(ageDays: number): number {
    const now = Date.now() / 1000; // Convert to Unix timestamp
    return now - (ageDays * 24 * 60 * 60);
  }
  
  /**
   * Handle rate limit with exponential backoff
   */
  private async handleRateLimit(): Promise<void> {
    const baseDelay = 60000; // 60 seconds base
    const delay = getExponentialBackoff(1, baseDelay, 300000); // Max 5 minutes
    console.log(`Rate limited, waiting ${delay / 1000}s...`);
    await this.delay(delay);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get current rate limiter stats
   */
  getRateLimiterStats() {
    return this.rateLimiter.getStats();
  }
}