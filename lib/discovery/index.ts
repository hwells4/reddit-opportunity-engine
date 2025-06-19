// Main exports for discovery services

export * from './types'
export { RedditValidator } from './reddit-validator'
export { PerplexityService } from './perplexity'
export { FirecrawlService } from './firecrawl'
export { AIAnalysisService } from './ai-analysis'
export { DiscoveryOrchestrator } from './orchestrator'

// Utility functions
export function extractSubredditName(text: string): string | null {
  // Extract subreddit name from various formats: r/name, /r/name, reddit.com/r/name
  const patterns = [
    /(?:^|\s)r\/([a-zA-Z0-9_]+)/,
    /(?:^|\s)\/r\/([a-zA-Z0-9_]+)/,
    /reddit\.com\/r\/([a-zA-Z0-9_]+)/
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }
  
  return null
}

export function isValidSubredditName(name: string): boolean {
  // Reddit subreddit name validation rules
  if (!name || name.length < 3 || name.length > 21) {
    return false
  }
  
  // Must contain only letters, numbers, and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return false
  }
  
  // Skip common false positives
  const blacklist = ['all', 'popular', 'random', 'friends', 'mod', 'user']
  if (blacklist.includes(name.toLowerCase())) {
    return false
  }
  
  return true
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}