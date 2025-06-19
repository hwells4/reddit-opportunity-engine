// Shared types for discovery services

export interface DiscoveryRequest {
  audience: string
  problem: string
  product: string
  questions?: string
  search_mode?: 'validation' | 'discovery'
}

export interface SubredditCandidate {
  name: string
  source: 'perplexity' | 'firecrawl' | 'fallback'
  relevance_reason: string
  confidence: number
  context?: string
}

export interface ValidatedSubreddit {
  name: string
  subscribers: number
  description: string
  public_description?: string
  is_active: boolean
  over_18: boolean
  validation_status: 'valid' | 'private' | 'not_found' | 'error'
  created_utc?: number
  url?: string
}

export interface SubredditRecommendation {
  name: string
  relevance_score: number
  relevance_reason: string
  engagement_approach: string
  category: 'primary' | 'secondary' | 'niche'
  subscribers?: number
  confidence?: number
}

export interface DiscoveryResults {
  candidates: SubredditCandidate[]
  validated_subreddits: ValidatedSubreddit[]
  recommendations: {
    primary: SubredditRecommendation[]
    secondary: SubredditRecommendation[]
    niche: SubredditRecommendation[]
  }
  discovery_sources: {
    perplexity_count: number
    firecrawl_count: number
    fallback_count: number
  }
  summary: string
  search_parameters: DiscoveryRequest
}

export interface HumanSelectionRequest {
  candidates: ValidatedSubreddit[]
  selected_subreddits: string[] // subreddit names
  user_notes?: string
}

// OpenRouter/AI related types
export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIModelConfig {
  models: string[]
  max_tokens?: number
  temperature?: number
  fallback_enabled?: boolean
}

// Reddit API response types
export interface RedditSubredditData {
  display_name: string
  subscribers: number
  public_description: string
  description: string
  over18: boolean
  created_utc: number
  url: string
  subreddit_type: 'public' | 'private' | 'restricted'
}

export interface RedditAPIResponse {
  kind: string
  data: RedditSubredditData
}

// External service types
export interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

export interface FirecrawlSearchResult {
  url: string
  title?: string
  content?: string
  markdown?: string
}

export interface FirecrawlResponse {
  data: FirecrawlSearchResult[]
}

// Error types
export class DiscoveryError extends Error {
  constructor(
    message: string, 
    public service: 'perplexity' | 'firecrawl' | 'reddit' | 'ai_analysis',
    public originalError?: Error
  ) {
    super(message)
    this.name = 'DiscoveryError'
  }
}

export class RateLimitError extends DiscoveryError {
  constructor(service: 'perplexity' | 'firecrawl' | 'reddit' | 'ai_analysis', retryAfter?: number) {
    super(`Rate limit exceeded for ${service}`, service)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
  
  retryAfter?: number
}