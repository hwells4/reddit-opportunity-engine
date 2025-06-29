import { SearchPost } from '../../app/api/search/types';
import { TokenBucketRateLimiter } from './rate-limiter';
import { getValidatedApiKey } from '../../utils/api-key-validation';

// Extended post interface with full content and comments
export interface HydratedPost extends SearchPost {
  fullSelfText: string;
  comments: RedditComment[];
  hydrationStats: {
    commentsFetched: number;
    truncatedComments: number;
    apiCalls: number;
    errors: string[];
  };
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  createdUtc: number;
  depth: number;
  replies?: RedditComment[];
}

export interface PostHydratorOptions {
  maxComments?: number;
  maxDepth?: number;
  minCommentScore?: number;
  concurrency?: number;
  premium?: boolean;
}

export interface HydratorResult {
  posts: HydratedPost[];
  stats: {
    inputPosts: number;
    successfulHydrations: number;
    failedHydrations: number;
    totalApiCalls: number;
    totalCommentsFetched: number;
    cost: number;
  };
}

export class PostHydrator {
  private static readonly BASE_URL = 'https://www.reddit.com';
  private static readonly FREE_TIER_QPM = 60; // Conservative for comments endpoint
  private static readonly DEFAULT_MAX_COMMENTS = 100;
  private static readonly DEFAULT_MAX_DEPTH = 3;
  private static readonly DEFAULT_CONCURRENCY = 8;
  
  private rateLimiter: TokenBucketRateLimiter;
  private enterpriseKey?: string;
  
  constructor(premium: boolean = false) {
    // Initialize rate limiter - more conservative for comments endpoint
    this.rateLimiter = new TokenBucketRateLimiter(
      premium ? 200 : PostHydrator.FREE_TIER_QPM,
      premium ? 200 : PostHydrator.FREE_TIER_QPM
    );
    
    if (premium) {
      this.enterpriseKey = getValidatedApiKey('REDDIT_ENTERPRISE_KEY') || undefined;
    }
  }
  
  /**
   * Hydrate posts with full content and comments
   * FR-6: Fetch full post JSON plus all comments when needed for analysis
   */
  async hydratePosts(
    posts: SearchPost[], 
    options: PostHydratorOptions = {}
  ): Promise<HydratorResult> {
    const opts = {
      maxComments: options.maxComments || PostHydrator.DEFAULT_MAX_COMMENTS,
      maxDepth: options.maxDepth || PostHydrator.DEFAULT_MAX_DEPTH,
      minCommentScore: options.minCommentScore || 1,
      concurrency: options.concurrency || PostHydrator.DEFAULT_CONCURRENCY,
      premium: options.premium || false
    };
    
    const result: HydratorResult = {
      posts: [],
      stats: {
        inputPosts: posts.length,
        successfulHydrations: 0,
        failedHydrations: 0,
        totalApiCalls: 0,
        totalCommentsFetched: 0,
        cost: 0
      }
    };
    
    if (posts.length === 0) {
      return result;
    }
    
    console.log(`[PostHydrator] Starting hydration of ${posts.length} posts`);
    
    // Process posts with controlled concurrency
    const semaphore = new Array(opts.concurrency).fill(null);
    const promises = posts.map(async (post, index) => {
      // Wait for available slot
      await semaphore[index % opts.concurrency];
      
      try {
        const hydratedPost = await this.hydratePost(post, opts);
        result.posts.push(hydratedPost);
        result.stats.successfulHydrations++;
        result.stats.totalCommentsFetched += hydratedPost.hydrationStats.commentsFetched;
        result.stats.totalApiCalls += hydratedPost.hydrationStats.apiCalls;
        
        console.log(`[PostHydrator] Hydrated ${post.id}: ${hydratedPost.hydrationStats.commentsFetched} comments`);
        
      } catch (error) {
        console.error(`[PostHydrator] Failed to hydrate ${post.id}:`, error);
        result.stats.failedHydrations++;
        
        // Add post with minimal hydration
        result.posts.push(this.createMinimalHydratedPost(post, error));
      }
    });
    
    await Promise.allSettled(promises);
    
    console.log(`[PostHydrator] Completed: ${result.stats.successfulHydrations} success, ${result.stats.failedHydrations} failed`);
    
    return result;
  }
  
  /**
   * Hydrate a single post with comments only (we already have full content from search)
   */
  private async hydratePost(post: SearchPost, options: PostHydratorOptions): Promise<HydratedPost> {
    // Wait for rate limit
    await this.rateLimiter.acquire();
    
    const hydrationStats = {
      commentsFetched: 0,
      truncatedComments: 0,
      apiCalls: 0,
      errors: [] as string[]
    };
    
    try {
      // Extract subreddit and post ID from URL
      // Expected format: https://reddit.com/r/subreddit/comments/postid/...
      const urlMatch = post.url.match(/\/r\/([^\/]+)\/comments\/([^\/]+)/);
      if (!urlMatch) {
        throw new Error(`Invalid Reddit URL format: ${post.url}`);
      }
      
      const [, subreddit, postId] = urlMatch;
      
      // Fetch ONLY comments (we already have full post content from search)
      const commentsData = await this.fetchPostComments(subreddit, postId);
      hydrationStats.apiCalls++;
      
      // Parse comments (second element contains the comment tree)
      const commentsTree = commentsData[1]?.data?.children || [];
      const comments = this.parseCommentTree(commentsTree, options, hydrationStats);
      
      return {
        ...post,
        fullSelfText: post.selfText || '', // Use existing selfText from search
        comments,
        hydrationStats
      };
      
    } catch (error) {
      hydrationStats.errors.push(error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
  
  /**
   * Fetch post and comments from Reddit API
   */
  private async fetchPostComments(subreddit: string, postId: string): Promise<any[]> {
    const url = `${PostHydrator.BASE_URL}/r/${subreddit}/comments/${postId}.json?limit=500&sort=top`;
    
    const headers: HeadersInit = {
      'User-Agent': 'SubtextSearchBot/2.0 (PostHydrator for Enhanced Analysis)',
      'Accept': 'application/json'
    };
    
    if (this.enterpriseKey) {
      headers['Authorization'] = `Bearer ${this.enterpriseKey}`;
    }
    
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(20000) // 20s timeout for comments
    });
    
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '60');
      throw new Error(`Rate limited for ${retryAfter}s`);
    }
    
    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  /**
   * Parse Reddit comment tree recursively
   */
  private parseCommentTree(
    children: any[],
    options: PostHydratorOptions,
    stats: { commentsFetched: number; truncatedComments: number },
    currentDepth: number = 0
  ): RedditComment[] {
    const comments: RedditComment[] = [];
    
    for (const child of children) {
      // Skip "more" comments pagination objects
      if (child.kind !== 't1') {
        continue;
      }
      
      const commentData = child.data;
      
      // Skip deleted/removed comments
      if (!commentData.body || commentData.body === '[deleted]' || commentData.body === '[removed]') {
        continue;
      }
      
      // Check depth limit
      if (currentDepth >= (options.maxDepth || PostHydrator.DEFAULT_MAX_DEPTH)) {
        stats.truncatedComments++;
        continue;
      }
      
      // Check score threshold
      if (commentData.score < (options.minCommentScore || 1)) {
        continue;
      }
      
      // Check comment limit
      if (stats.commentsFetched >= (options.maxComments || PostHydrator.DEFAULT_MAX_COMMENTS)) {
        stats.truncatedComments++;
        continue;
      }
      
      const comment: RedditComment = {
        id: commentData.id,
        author: commentData.author || '[unknown]',
        body: commentData.body,
        score: commentData.score || 0,
        createdUtc: commentData.created_utc || 0,
        depth: currentDepth
      };
      
      // Parse replies recursively
      if (commentData.replies && commentData.replies.data) {
        comment.replies = this.parseCommentTree(
          commentData.replies.data.children,
          options,
          stats,
          currentDepth + 1
        );
      }
      
      comments.push(comment);
      stats.commentsFetched++;
    }
    
    return comments;
  }
  
  /**
   * Create minimal hydrated post when hydration fails
   */
  private createMinimalHydratedPost(post: SearchPost, error: any): HydratedPost {
    return {
      ...post,
      fullSelfText: post.selfText || '',
      comments: [],
      hydrationStats: {
        commentsFetched: 0,
        truncatedComments: 0,
        apiCalls: 0,
        errors: [error instanceof Error ? error.message : 'Unknown hydration error']
      }
    };
  }
  
  /**
   * Get flattened comment text for LLM analysis
   */
  static getCommentText(comments: RedditComment[], maxChars: number = 5000): string {
    const commentTexts: string[] = [];
    let totalChars = 0;
    
    function extractComments(commentList: RedditComment[]) {
      for (const comment of commentList) {
        if (totalChars >= maxChars) break;
        
        const commentText = `[${comment.author}, score: ${comment.score}] ${comment.body}`;
        if (totalChars + commentText.length <= maxChars) {
          commentTexts.push(commentText);
          totalChars += commentText.length;
          
          // Process replies
          if (comment.replies) {
            extractComments(comment.replies);
          }
        }
      }
    }
    
    extractComments(comments);
    return commentTexts.join('\n\n');
  }
}