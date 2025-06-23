/**
 * Processing Monitor - Analytics and monitoring for the quote parsing system
 * Tracks success rates, error patterns, and system health metrics
 */

interface ProcessingMetrics {
  totalRuns: number
  totalPosts: number
  totalQuotes: number
  successRates: {
    posts: number      // % of posts successfully saved
    quotes: number     // % of posts with quotes extracted
    overall: number    // % of posts with full success
  }
  errorBreakdown: Record<string, number>
  fallbackUsage: Record<string, number>
  commonFailurePatterns: string[]
  averageQuotesPerPost: number
  timestamp: string
}

interface FailurePattern {
  pattern: string
  frequency: number
  lastSeen: string
  examples: string[]
}

export class ProcessingMonitor {
  private static metrics: ProcessingMetrics = {
    totalRuns: 0,
    totalPosts: 0,
    totalQuotes: 0,
    successRates: { posts: 0, quotes: 0, overall: 0 },
    errorBreakdown: {},
    fallbackUsage: {},
    commonFailurePatterns: [],
    averageQuotesPerPost: 0,
    timestamp: new Date().toISOString()
  }

  private static failurePatterns: Map<string, FailurePattern> = new Map()

  /**
   * Record metrics from a processing run
   */
  static recordRun(data: {
    runId: string
    totalPosts: number
    postsSaved: number
    quotesExtracted: number
    errors: Array<{ type: string, message: string, details?: any }>
    fallbacksUsed: string[]
  }) {
    // Update basic counters
    this.metrics.totalRuns++
    this.metrics.totalPosts += data.totalPosts
    this.metrics.totalQuotes += data.quotesExtracted

    // Update success rates
    this.updateSuccessRates(data)

    // Track error patterns
    this.trackErrors(data.errors)

    // Track fallback usage
    this.trackFallbacks(data.fallbacksUsed)

    // Update average quotes per post
    this.metrics.averageQuotesPerPost = this.metrics.totalQuotes / this.metrics.totalPosts

    // Update timestamp
    this.metrics.timestamp = new Date().toISOString()

    // Log summary for debugging
    console.log(`[ProcessingMonitor] Run ${data.runId}:`, {
      posts: `${data.postsSaved}/${data.totalPosts}`,
      quotes: data.quotesExtracted,
      errors: data.errors.length,
      fallbacks: data.fallbacksUsed
    })
  }

  /**
   * Get current system health metrics
   */
  static getHealthMetrics(): ProcessingMetrics & { 
    status: 'healthy' | 'degraded' | 'critical',
    alerts: string[]
  } {
    const alerts: string[] = []
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy'

    // Check post success rate
    if (this.metrics.successRates.posts < 50) {
      status = 'critical'
      alerts.push(`Critical: Post save rate is ${this.metrics.successRates.posts.toFixed(1)}%`)
    } else if (this.metrics.successRates.posts < 80) {
      status = 'degraded'
      alerts.push(`Warning: Post save rate is ${this.metrics.successRates.posts.toFixed(1)}%`)
    }

    // Check quote extraction rate
    if (this.metrics.successRates.quotes < 30) {
      alerts.push(`Warning: Quote extraction rate is ${this.metrics.successRates.quotes.toFixed(1)}%`)
      if (status === 'healthy') status = 'degraded'
    }

    // Check for high fallback usage
    const totalFallbacks = Object.values(this.metrics.fallbackUsage).reduce((a, b) => a + b, 0)
    const fallbackRate = (totalFallbacks / this.metrics.totalPosts) * 100
    if (fallbackRate > 50) {
      alerts.push(`High fallback usage: ${fallbackRate.toFixed(1)}% of posts using fallbacks`)
      if (status === 'healthy') status = 'degraded'
    }

    return {
      ...this.metrics,
      status,
      alerts
    }
  }

  /**
   * Get detailed error analysis
   */
  static getErrorAnalysis(): {
    errorBreakdown: Record<string, number>
    commonPatterns: FailurePattern[]
    recommendations: string[]
  } {
    const recommendations: string[] = []
    const patterns = Array.from(this.failurePatterns.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10)

    // Generate recommendations based on error patterns
    if (this.metrics.errorBreakdown.quote_parsing > this.metrics.errorBreakdown.post_insertion) {
      recommendations.push("Focus on improving quote parsing reliability")
    }

    if (this.metrics.errorBreakdown.quote_insertion > 0) {
      recommendations.push("Check database quote insertion logic")
    }

    if (this.metrics.fallbackUsage.unstructured_fallback > this.metrics.totalPosts * 0.1) {
      recommendations.push("High unstructured fallback usage - improve primary parsers")
    }

    return {
      errorBreakdown: this.metrics.errorBreakdown,
      commonPatterns: patterns,
      recommendations
    }
  }

  /**
   * Reset metrics (for testing or periodic resets)
   */
  static reset() {
    this.metrics = {
      totalRuns: 0,
      totalPosts: 0,
      totalQuotes: 0,
      successRates: { posts: 0, quotes: 0, overall: 0 },
      errorBreakdown: {},
      fallbackUsage: {},
      commonFailurePatterns: [],
      averageQuotesPerPost: 0,
      timestamp: new Date().toISOString()
    }
    this.failurePatterns.clear()
  }

  private static updateSuccessRates(data: {
    totalPosts: number
    postsSaved: number
    quotesExtracted: number
  }) {
    // Calculate running averages
    const totalPostsEver = this.metrics.totalPosts
    const totalRunsEver = this.metrics.totalRuns

    if (totalPostsEver > 0) {
      // Posts success rate
      const currentPostRate = (data.postsSaved / data.totalPosts) * 100
      this.metrics.successRates.posts = 
        ((this.metrics.successRates.posts * (totalRunsEver - 1)) + currentPostRate) / totalRunsEver

      // Quotes success rate (posts with at least 1 quote)
      const postsWithQuotes = data.quotesExtracted > 0 ? data.postsSaved : 0
      const currentQuoteRate = (postsWithQuotes / data.totalPosts) * 100
      this.metrics.successRates.quotes = 
        ((this.metrics.successRates.quotes * (totalRunsEver - 1)) + currentQuoteRate) / totalRunsEver

      // Overall success rate (posts saved AND quotes extracted)
      const overallSuccesses = postsWithQuotes
      const currentOverallRate = (overallSuccesses / data.totalPosts) * 100
      this.metrics.successRates.overall = 
        ((this.metrics.successRates.overall * (totalRunsEver - 1)) + currentOverallRate) / totalRunsEver
    }
  }

  private static trackErrors(errors: Array<{ type: string, message: string, details?: any }>) {
    for (const error of errors) {
      // Count error types
      this.metrics.errorBreakdown[error.type] = (this.metrics.errorBreakdown[error.type] || 0) + 1

      // Track failure patterns
      const patternKey = `${error.type}: ${error.message.substring(0, 100)}`
      const existing = this.failurePatterns.get(patternKey)
      
      if (existing) {
        existing.frequency++
        existing.lastSeen = new Date().toISOString()
        if (existing.examples.length < 3) {
          existing.examples.push(JSON.stringify(error.details).substring(0, 200))
        }
      } else {
        this.failurePatterns.set(patternKey, {
          pattern: patternKey,
          frequency: 1,
          lastSeen: new Date().toISOString(),
          examples: [JSON.stringify(error.details).substring(0, 200)]
        })
      }
    }
  }

  private static trackFallbacks(fallbacksUsed: string[]) {
    for (const fallback of fallbacksUsed) {
      this.metrics.fallbackUsage[fallback] = (this.metrics.fallbackUsage[fallback] || 0) + 1
    }
  }
}

/**
 * Middleware for automatic monitoring
 */
export function withProcessingMonitor<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  monitorName: string
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now()
    
    try {
      const result = await fn(...args)
      
      // Record successful execution
      console.log(`[Monitor:${monitorName}] Success in ${Date.now() - startTime}ms`)
      
      return result
    } catch (error: any) {
      // Record failed execution
      console.error(`[Monitor:${monitorName}] Failed in ${Date.now() - startTime}ms:`, error.message)
      throw error
    }
  }) as T
}