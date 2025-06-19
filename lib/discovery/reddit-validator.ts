import { ValidatedSubreddit, RedditAPIResponse, RateLimitError, DiscoveryError } from './types'
import { isValidSubredditName, sleep } from './index'

export class RedditValidator {
  private static readonly BASE_URL = 'https://www.reddit.com'
  private static readonly REQUEST_DELAY = 1000 // 1 second between requests
  private lastRequestTime = 0

  /**
   * Validate a single subreddit using Reddit's JSON API
   */
  async validateSubreddit(name: string): Promise<ValidatedSubreddit | null> {
    // Basic name validation first
    if (!isValidSubredditName(name)) {
      return null
    }

    // Rate limiting - ensure we don't hit Reddit too hard
    await this.enforceRateLimit()

    try {
      const url = `${RedditValidator.BASE_URL}/r/${name}/about.json`
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SubtextDiscoveryBot/1.0 (Reddit Community Discovery Tool)',
          'Accept': 'application/json'
        },
        // 10 second timeout
        signal: AbortSignal.timeout(10000)
      })

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '60')
        throw new RateLimitError('reddit', retryAfter)
      }

      if (response.status === 404) {
        return this.createNotFoundResult(name)
      }

      if (response.status === 403) {
        return this.createPrivateResult(name)
      }

      if (!response.ok) {
        throw new DiscoveryError(
          `Reddit API returned ${response.status}: ${response.statusText}`,
          'reddit'
        )
      }

      const data: RedditAPIResponse = await response.json()
      
      if (!data.data) {
        return this.createErrorResult(name, 'Invalid response format')
      }

      return this.mapRedditDataToValidated(data.data)

    } catch (error) {
      if (error instanceof RateLimitError || error instanceof DiscoveryError) {
        throw error
      }

      if (error instanceof DOMException && error.name === 'TimeoutError') {
        return this.createErrorResult(name, 'Request timeout')
      }

      console.error(`Error validating r/${name}:`, error)
      return this.createErrorResult(name, error instanceof Error ? error.message : 'Unknown error')
    }
  }

  /**
   * Validate multiple subreddits with proper rate limiting and error handling
   */
  async validateSubreddits(names: string[]): Promise<ValidatedSubreddit[]> {
    const results: ValidatedSubreddit[] = []
    const errors: Array<{name: string, error: string}> = []

    console.log(`🔍 Validating ${names.length} subreddits...`)

    for (const name of names) {
      try {
        const result = await this.validateSubreddit(name)
        if (result) {
          results.push(result)
          console.log(`✅ r/${name} - ${result.subscribers.toLocaleString()} subscribers`)
        } else {
          console.log(`❌ r/${name} - invalid name format`)
        }
      } catch (error) {
        if (error instanceof RateLimitError) {
          console.log(`⏰ Rate limited, waiting ${error.retryAfter || 60} seconds...`)
          await sleep((error.retryAfter || 60) * 1000)
          // Retry this subreddit
          try {
            const result = await this.validateSubreddit(name)
            if (result) {
              results.push(result)
              console.log(`✅ r/${name} - ${result.subscribers.toLocaleString()} subscribers (retried)`)
            }
          } catch (retryError) {
            errors.push({name, error: retryError instanceof Error ? retryError.message : 'Retry failed'})
            console.log(`❌ r/${name} - retry failed`)
          }
        } else {
          errors.push({name, error: error instanceof Error ? error.message : 'Unknown error'})
          console.log(`❌ r/${name} - ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
    }

    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} validation errors occurred:`)
      errors.forEach(({name, error}) => console.log(`  - r/${name}: ${error}`))
    }

    return results.sort((a, b) => b.subscribers - a.subscribers) // Sort by subscriber count
  }

  /**
   * Get basic subreddit info for display (lighter validation)
   */
  async getSubredditInfo(name: string): Promise<Pick<ValidatedSubreddit, 'name' | 'subscribers' | 'description'> | null> {
    const validated = await this.validateSubreddit(name)
    if (!validated) return null

    return {
      name: validated.name,
      subscribers: validated.subscribers,
      description: validated.description
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    
    if (timeSinceLastRequest < RedditValidator.REQUEST_DELAY) {
      const waitTime = RedditValidator.REQUEST_DELAY - timeSinceLastRequest
      await sleep(waitTime)
    }
    
    this.lastRequestTime = Date.now()
  }

  private mapRedditDataToValidated(data: any): ValidatedSubreddit {
    return {
      name: data.display_name || data.name,
      subscribers: data.subscribers || 0,
      description: data.public_description || data.description || '',
      public_description: data.public_description || '',
      is_active: (data.subscribers || 0) > 100, // Consider active if >100 subscribers
      over_18: data.over18 || false,
      validation_status: 'valid',
      created_utc: data.created_utc,
      url: `https://reddit.com${data.url || `/r/${data.display_name}`}`
    }
  }

  private createNotFoundResult(name: string): ValidatedSubreddit {
    return {
      name,
      subscribers: 0,
      description: 'Subreddit not found',
      is_active: false,
      over_18: false,
      validation_status: 'not_found'
    }
  }

  private createPrivateResult(name: string): ValidatedSubreddit {
    return {
      name,
      subscribers: 0,
      description: 'Private subreddit',
      is_active: false,
      over_18: false,
      validation_status: 'private'
    }
  }

  private createErrorResult(name: string, error: string): ValidatedSubreddit {
    return {
      name,
      subscribers: 0,
      description: `Validation error: ${error}`,
      is_active: false,
      over_18: false,
      validation_status: 'error'
    }
  }

  /**
   * Check if a subreddit exists (lightweight check)
   */
  async subredditExists(name: string): Promise<boolean> {
    try {
      const result = await this.validateSubreddit(name)
      return result?.validation_status === 'valid'
    } catch {
      return false
    }
  }

  /**
   * Get subscriber count for a subreddit (for Gumloop requirements)
   */
  async getSubscriberCount(name: string): Promise<number> {
    try {
      const result = await this.validateSubreddit(name)
      return result?.subscribers || 0
    } catch {
      return 0
    }
  }
}