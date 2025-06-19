import { SubredditCandidate, PerplexityResponse, DiscoveryError, RateLimitError } from './types'
import { AIAnalysisService } from './ai-analysis'
import { extractSubredditName, isValidSubredditName, sleep } from './index'

export class PerplexityService {
  private apiKey: string
  private baseURL = 'https://api.perplexity.ai/chat/completions'
  private aiAnalysis: AIAnalysisService
  private lastRequestTime = 0
  private readonly REQUEST_DELAY = 1000 // 1 second between requests

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || ''
    this.aiAnalysis = new AIAnalysisService()
    
    if (!this.apiKey) {
      console.warn('⚠️ PERPLEXITY_API_KEY not found. Perplexity discovery will be disabled.')
    }
  }

  /**
   * Discover subreddits using Perplexity's agentic AI capabilities
   */
  async discoverSubreddits(
    audience: string,
    problem: string,
    product: string,
    questions: string
  ): Promise<SubredditCandidate[]> {
    if (!this.apiKey) {
      throw new DiscoveryError('Perplexity API key not configured', 'perplexity')
    }

    console.log('🧠 Generating intelligent Perplexity queries...')
    
    // Use AI to generate intelligent queries instead of hardcoded ones
    const queries = await this.aiAnalysis.generateSearchQueries(
      audience,
      problem,
      product,
      questions,
      'perplexity'
    )

    console.log(`📝 Generated ${queries.length} intelligent queries`)

    const allCandidates: SubredditCandidate[] = []

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      try {
        console.log(`🔍 Query ${i + 1}/${queries.length}: ${query.slice(0, 80)}...`)
        
        const candidates = await this.queryPerplexity(query)
        allCandidates.push(...candidates)
        
        console.log(`✅ Found ${candidates.length} candidates from query ${i + 1}`)
        
        // Rate limiting between requests
        if (i < queries.length - 1) {
          await this.enforceRateLimit()
        }
      } catch (error) {
        if (error instanceof RateLimitError) {
          console.log(`⏰ Rate limited, waiting ${error.retryAfter || 60}s...`)
          await sleep((error.retryAfter || 60) * 1000)
          // Retry this query
          try {
            const candidates = await this.queryPerplexity(query)
            allCandidates.push(...candidates)
            console.log(`✅ Found ${candidates.length} candidates from query ${i + 1} (retried)`)
          } catch (retryError) {
            console.error(`❌ Query ${i + 1} failed after retry:`, retryError)
          }
        } else {
          console.error(`❌ Query ${i + 1} failed:`, error)
        }
      }
    }

    // Deduplicate candidates
    const uniqueCandidates = this.deduplicateCandidates(allCandidates)
    console.log(`🎯 ${uniqueCandidates.length} unique candidates after deduplication`)

    return uniqueCandidates
  }

  /**
   * Query Perplexity API with intelligent context
   */
  private async queryPerplexity(query: string): Promise<SubredditCandidate[]> {
    await this.enforceRateLimit()

    const payload = {
      model: "llama-3.1-sonar-large-128k-online",
      messages: [
        {
          role: "system",
          content: `You are a Reddit expert with deep knowledge of communities and their cultures. When analyzing Reddit communities, focus on:
1. Community size and activity levels
2. How welcoming they are to new members
3. Their specific rules and moderation style  
4. What types of content perform well
5. The community's attitude toward business/promotional content

Always provide specific subreddit names with r/ prefix and explain WHY each community would be relevant for the given context.`
        },
        {
          role: "user",
          content: `${query}

Please provide specific subreddit recommendations with r/ prefix. For each subreddit, explain:
- Why it's relevant for this context
- What makes it a good community for engagement
- Any important rules or cultural considerations
- Approximate community size and activity level

Focus on communities that are active, welcoming, and have engaged discussions about these topics.`
        }
      ],
      max_tokens: 1500,
      temperature: 0.1,
      top_p: 0.9,
      return_citations: true,
      search_domain_filter: ["reddit.com"],
      return_images: false,
      return_related_questions: false,
      search_recency_filter: "month",
      top_k: 0,
      stream: false,
      presence_penalty: 0,
      frequency_penalty: 1
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
      const retryAfter = parseInt(response.headers.get('retry-after') || '60')
      throw new RateLimitError('perplexity', retryAfter)
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new DiscoveryError(
        `Perplexity API error ${response.status}: ${errorText}`,
        'perplexity'
      )
    }

    const data: PerplexityResponse = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new DiscoveryError('Empty response from Perplexity', 'perplexity')
    }

    return this.extractSubredditsFromResponse(content)
  }

  /**
   * Extract subreddit information from Perplexity's response
   */
  private extractSubredditsFromResponse(content: string): SubredditCandidate[] {
    const candidates: SubredditCandidate[] = []
    
    // Split response into sections and extract subreddits
    const lines = content.split('\n')
    let currentContext = ''
    
    for (const line of lines) {
      // Extract subreddit names using various patterns
      const patterns = [/r\/([a-zA-Z0-9_]+)/g, /\/r\/([a-zA-Z0-9_]+)/g]
      
      for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(line)) !== null) {
          const name = match[1]
          
          if (isValidSubredditName(name)) {
            // Extract context around this subreddit mention
            const context = this.extractContextForSubreddit(content, name)
            
            candidates.push({
              name,
              source: 'perplexity',
              relevance_reason: context,
              confidence: 0.8,
              context: line.trim()
            })
          }
        }
      }
    }

    return candidates
  }

  /**
   * Extract context explaining why a subreddit is relevant
   */
  private extractContextForSubreddit(content: string, subredditName: string): string {
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // If this line mentions the subreddit, get surrounding context
      if (line.includes(`r/${subredditName}`) || line.includes(`/r/${subredditName}`)) {
        // Get this line and potentially next few lines for context
        const contextLines = []
        
        // Add current line
        contextLines.push(line.replace(/r\/\w+/g, '').trim())
        
        // Add next line if it seems to be explaining the subreddit
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim()
          if (nextLine && !nextLine.includes('r/') && nextLine.length > 20) {
            contextLines.push(nextLine)
          }
        }
        
        const context = contextLines.join(' ').trim()
        return context || `Recommended by Perplexity AI for relevant discussions`
      }
    }
    
    return `Relevant community identified by Perplexity AI`
  }

  /**
   * Remove duplicate candidates, keeping the one with best context
   */
  private deduplicateCandidates(candidates: SubredditCandidate[]): SubredditCandidate[] {
    const uniqueMap = new Map<string, SubredditCandidate>()
    
    for (const candidate of candidates) {
      const existing = uniqueMap.get(candidate.name)
      
      if (!existing || candidate.relevance_reason.length > existing.relevance_reason.length) {
        uniqueMap.set(candidate.name, candidate)
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
   * Health check for Perplexity service
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
          model: "llama-3.1-sonar-large-128k-online",
          messages: [{ role: "user", content: "Say OK if you can respond." }],
          max_tokens: 10
        }),
        signal: AbortSignal.timeout(10000)
      })

      return response.ok
    } catch {
      return false
    }
  }
}