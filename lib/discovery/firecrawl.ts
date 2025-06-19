import { SubredditCandidate, FirecrawlResponse, DiscoveryError, RateLimitError } from './types'
import { AIAnalysisService } from './ai-analysis'
import { extractSubredditName, isValidSubredditName, sleep } from './index'

export class FirecrawlService {
  private apiKey: string
  private baseURL = 'https://api.firecrawl.dev/v1/search'
  private aiAnalysis: AIAnalysisService
  private lastRequestTime = 0
  private readonly REQUEST_DELAY = 2000 // 2 seconds between requests (Firecrawl is more rate-limited)

  constructor() {
    this.apiKey = process.env.FIRECRAWL_API_KEY || ''
    this.aiAnalysis = new AIAnalysisService()
    
    if (!this.apiKey) {
      console.warn('⚠️ FIRECRAWL_API_KEY not found. Firecrawl discovery will be disabled.')
    }
  }

  /**
   * Generate direct searches using the actual research questions + "site:reddit.com"
   */
  private generateQuestionBasedQueries(questions: string): string[] {
    if (!questions || questions.trim().length === 0) {
      return []
    }

    try {
      // Parse questions if they're in JSON array format
      let questionList: string[] = []
      if (questions.trim().startsWith('[')) {
        questionList = JSON.parse(questions)
      } else {
        // Split by common delimiters if it's a plain text list
        questionList = questions.split(/[?\n•-]/).map(q => q.trim()).filter(q => q.length > 10)
      }

      // Take first 4-5 questions and append site:reddit.com search
      const searchQueries = questionList.slice(0, 5).map(question => {
        // Clean up the question and make it searchable
        const cleanQuestion = question
          .replace(/^How do/, 'How do')
          .replace(/^What /, 'What ')
          .replace(/[?"]/g, '')
          .trim()
        
        return `${cleanQuestion} site:reddit.com`
      })

      return searchQueries.filter(q => q.length > 20) // Filter out too-short queries
    } catch (error) {
      console.warn('Could not parse questions for direct search, falling back to AI queries only')
      return []
    }
  }

  /**
   * Discover subreddits using Firecrawl's search capabilities
   */
  async discoverSubreddits(
    audience: string,
    problem: string,
    product: string,
    questions: string
  ): Promise<SubredditCandidate[]> {
    if (!this.apiKey) {
      throw new DiscoveryError('Firecrawl API key not configured', 'firecrawl')
    }

    console.log('🔥 Generating Firecrawl search strategies...')
    
    // Strategy 1: Direct question searches with site:reddit.com
    const questionQueries = this.generateQuestionBasedQueries(questions)
    console.log(`📝 Generated ${questionQueries.length} question-based queries`)
    
    // Strategy 2: AI-generated intelligent queries
    const aiQueries = await this.aiAnalysis.generateSearchQueries(
      audience,
      problem,
      product,
      questions,
      'firecrawl'
    )
    console.log(`📝 Generated ${aiQueries.length} AI-intelligent queries`)
    
    // Combine both strategies
    const queries = [...questionQueries, ...aiQueries.slice(0, 3)]

    console.log(`📝 Generated ${queries.length} search queries`)

    const allCandidates: SubredditCandidate[] = []

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      try {
        console.log(`🔍 Search ${i + 1}/${queries.length}: ${query.slice(0, 80)}...`)
        
        const candidates = await this.searchWithFirecrawl(query)
        allCandidates.push(...candidates)
        
        console.log(`✅ Found ${candidates.length} candidates from search ${i + 1}`)
        
        // Rate limiting between requests  
        if (i < queries.length - 1) {
          await this.enforceRateLimit()
        }
      } catch (error) {
        if (error instanceof RateLimitError) {
          console.log(`⏰ Rate limited, waiting ${error.retryAfter || 60}s...`)
          await sleep((error.retryAfter || 60) * 1000)
          // Retry this search
          try {
            const candidates = await this.searchWithFirecrawl(query)
            allCandidates.push(...candidates)
            console.log(`✅ Found ${candidates.length} candidates from search ${i + 1} (retried)`)
          } catch (retryError) {
            console.error(`❌ Search ${i + 1} failed after retry:`, retryError)
          }
        } else {
          console.error(`❌ Search ${i + 1} failed:`, error)
        }
      }
    }

    // Deduplicate candidates
    const uniqueCandidates = this.deduplicateCandidates(allCandidates)
    console.log(`🎯 ${uniqueCandidates.length} unique candidates after deduplication`)

    return uniqueCandidates
  }

  /**
   * Search using Firecrawl API
   */
  private async searchWithFirecrawl(query: string): Promise<SubredditCandidate[]> {
    await this.enforceRateLimit()

    const payload = {
      query,
      pageOptions: {
        onlyMainContent: true,
        includeHtml: false,
        includeRawHtml: false
      },
      limit: 8 // Reasonable limit to avoid hitting rate limits
    }

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000) // 60 second timeout
    })

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '120')
      throw new RateLimitError('firecrawl', retryAfter)
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new DiscoveryError(
        `Firecrawl API error ${response.status}: ${errorText}`,
        'firecrawl'
      )
    }

    const data: FirecrawlResponse = await response.json()
    const candidates: SubredditCandidate[] = []

    for (const result of data.data || []) {
      // Extract subreddits from URLs
      const urlCandidates = this.extractSubredditsFromUrl(result.url)
      candidates.push(...urlCandidates)

      // Extract subreddits from content
      const contentCandidates = this.extractSubredditsFromContent(
        result.markdown || result.content || '',
        result.title || '',
        result.url
      )
      candidates.push(...contentCandidates)
    }

    return candidates
  }

  /**
   * Extract subreddit names from URLs
   */
  private extractSubredditsFromUrl(url: string): SubredditCandidate[] {
    const candidates: SubredditCandidate[] = []
    
    // Match Reddit URLs
    const redditUrlPattern = /reddit\.com\/r\/([a-zA-Z0-9_]+)/g
    let match

    while ((match = redditUrlPattern.exec(url)) !== null) {
      const name = match[1]
      
      if (isValidSubredditName(name)) {
        candidates.push({
          name,
          source: 'firecrawl',
          relevance_reason: 'Found in Reddit URL from search results',
          confidence: 0.9,
          context: url
        })
      }
    }

    return candidates
  }

  /**
   * Extract subreddit names from content with context
   */
  private extractSubredditsFromContent(
    content: string, 
    title: string, 
    sourceUrl: string
  ): SubredditCandidate[] {
    const candidates: SubredditCandidate[] = []
    
    // Patterns to match subreddit mentions
    const patterns = [
      /(?:^|\s)r\/([a-zA-Z0-9_]+)/g,
      /(?:^|\s)\/r\/([a-zA-Z0-9_]+)/g
    ]

    const fullText = `${title} ${content}`

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(fullText)) !== null) {
        const name = match[1]
        
        if (isValidSubredditName(name)) {
          // Extract context around the mention
          const context = this.extractContextAroundMention(fullText, match.index, name)
          
          candidates.push({
            name,
            source: 'firecrawl',
            relevance_reason: context,
            confidence: 0.7,
            context: `Found in: ${title || sourceUrl}`
          })
        }
      }
    }

    return candidates
  }

  /**
   * Extract context around a subreddit mention
   */
  private extractContextAroundMention(text: string, mentionIndex: number, subredditName: string): string {
    const contextRadius = 150 // Characters before and after
    const start = Math.max(0, mentionIndex - contextRadius)
    const end = Math.min(text.length, mentionIndex + subredditName.length + contextRadius)
    
    let context = text.slice(start, end).trim()
    
    // Clean up the context
    context = context
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s.,!?-]/g, '') // Remove special characters
      .trim()

    // If context is too short or not meaningful, provide a default
    if (context.length < 20 || !context.includes(subredditName)) {
      return 'Mentioned in relevant Reddit discussion'
    }

    // Truncate if too long
    if (context.length > 200) {
      context = context.slice(0, 200) + '...'
    }

    return context
  }

  /**
   * Remove duplicate candidates, keeping the one with best confidence/context
   */
  private deduplicateCandidates(candidates: SubredditCandidate[]): SubredditCandidate[] {
    const uniqueMap = new Map<string, SubredditCandidate>()
    
    for (const candidate of candidates) {
      const existing = uniqueMap.get(candidate.name)
      
      if (!existing) {
        uniqueMap.set(candidate.name, candidate)
      } else {
        // Keep the one with higher confidence, or better context
        if (candidate.confidence > existing.confidence || 
            (candidate.confidence === existing.confidence && 
             candidate.relevance_reason.length > existing.relevance_reason.length)) {
          uniqueMap.set(candidate.name, candidate)
        }
      }
    }
    
    return Array.from(uniqueMap.values())
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    
    if (timeSinceLastRequest < this.REQUEST_DELAY) {
      const waitTime = this.REQUEST_DELAY - timeSinceLastRequest
      await sleep(waitTime)
    }
    
    this.lastRequestTime = Date.now()
  }

  /**
   * Health check for Firecrawl service
   */
  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) {
      return false
    }

    try {
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: 'test reddit site:reddit.com',
          limit: 1
        }),
        signal: AbortSignal.timeout(10000)
      })

      return response.ok
    } catch {
      return false
    }
  }
}