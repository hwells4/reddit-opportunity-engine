// Search API types matching PRD specifications

// Request types
export interface SearchRequest {
  audience: string;
  questions: string[];
  maxPosts?: number;
  ageDays?: number;
  minScore?: number;
  embedProvider?: 'openai' | 'miniLM' | 'bge';
  premium?: boolean;
  storeVectors?: boolean;
}

// Response types
export interface SearchPost {
  id: string;
  url: string;
  score: number;
  createdUtc: number;
  subreddit: string;
  snippet: string;
  title: string;
  // Extended fields for internal use
  selfText?: string;
  authorFullname?: string;
  numComments?: number;
  vector?: number[]; // For future pgvector storage
}

export interface SearchStats {
  rawFetched: number;
  afterEmbed: number;
  afterGate: number;
  apiCalls: number;
  tokenCostUSD: number;
  elapsedSec: number;
  // Enhanced classification tracking for A/B testing
  classifications?: {
    highValue: number;
    moderateValue: number;
    lowValue: number;
    irrelevant: number;
  };
  hydration?: {
    successfulHydrations: number;
    failedHydrations: number;
    totalCommentsFetched: number;
  };
}

export interface SearchResponse {
  runId: string;
  posts: SearchPost[];
  stats: SearchStats;
}

// Worker configuration
export interface WorkerConfig {
  search: number;
  embed: number;
  flash: number;
}

// Cost tracking
export interface CostBreakdown {
  redditEnterprise: number;
  openaiEmbeddings: number;
  geminiFlash: number;
  total: number;
}

// Pipeline stage results
export interface StageResult<T> {
  data: T;
  metrics: {
    processed: number;
    duration: number;
    apiCalls: number;
    cost: number;
  };
}

// Reddit API types
export interface RedditSearchParams {
  q: string;
  subreddit?: string;
  sort: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
  t?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  limit: number;
  after?: string;
  restrict_sr?: boolean;
  type?: 'link' | 'self' | 'image' | 'video' | 'videogif';
}

export interface RedditPost {
  id: string;
  subreddit: string;
  author_fullname: string;
  title: string;
  selftext: string;
  ups: number;
  downs: number;
  score: number;
  created_utc: number;
  num_comments: number;
  permalink: string;
  url: string;
  over_18: boolean;
  spoiler: boolean;
}