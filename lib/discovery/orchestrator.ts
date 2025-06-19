import { 
  DiscoveryRequest, 
  DiscoveryResults, 
  SubredditCandidate, 
  ValidatedSubreddit,
  DiscoveryError 
} from './types'
import { RedditValidator } from './reddit-validator'
import { PerplexityService } from './perplexity'
import { FirecrawlService } from './firecrawl'
import { AIAnalysisService } from './ai-analysis'
import { extractSubredditName, isValidSubredditName } from './index'

export class DiscoveryOrchestrator {
  private redditValidator: RedditValidator
  private perplexityService: PerplexityService
  private firecrawlService: FirecrawlService
  private aiAnalysis: AIAnalysisService

  constructor() {
    this.redditValidator = new RedditValidator()
    this.perplexityService = new PerplexityService()
    this.firecrawlService = new FirecrawlService()
    this.aiAnalysis = new AIAnalysisService()
  }

  /**
   * Main discovery method - orchestrates the entire process
   */
  async discoverSubreddits(request: DiscoveryRequest): Promise<DiscoveryResults> {
    console.log('🚀 Starting enhanced subreddit discovery...')
    console.log(`📋 Product: ${request.product}`)
    console.log(`🎯 Problem: ${request.problem}`)
    console.log(`👥 Audience: ${request.audience}`)

    const startTime = Date.now()
    const allCandidates = new Set<string>()
    let perplexityCandidates: SubredditCandidate[] = []
    let firecrawlCandidates: SubredditCandidate[] = []
    let fallbackCandidates: SubredditCandidate[] = []

    // Phase 1: Discovery from multiple sources
    console.log('\n🔍 Phase 1: Multi-source Discovery')

    // 1.1 Perplexity AI Discovery
    try {
      console.log('🧠 Using Perplexity AI for intelligent discovery...')
      perplexityCandidates = await this.perplexityService.discoverSubreddits(
        request.audience,
        request.problem,
        request.product,
        request.questions || ''
      )
      perplexityCandidates.forEach(c => allCandidates.add(c.name))
      console.log(`✅ Perplexity found ${perplexityCandidates.length} candidates`)
    } catch (error) {
      console.error('❌ Perplexity discovery failed:', error)
      if (error instanceof DiscoveryError) {
        console.log('🔄 Continuing with other sources...')
      }
    }

    // 1.2 Firecrawl Discovery  
    try {
      console.log('🔥 Using Firecrawl for Reddit search...')
      firecrawlCandidates = await this.firecrawlService.discoverSubreddits(
        request.audience,
        request.problem,
        request.product,
        request.questions || ''
      )
      firecrawlCandidates.forEach(c => allCandidates.add(c.name))
      console.log(`✅ Firecrawl found ${firecrawlCandidates.length} candidates`)
    } catch (error) {
      console.error('❌ Firecrawl discovery failed:', error)
      if (error instanceof DiscoveryError) {
        console.log('🔄 Continuing with other sources...')
      }
    }

    // 1.3 Fallback if no external sources worked
    if (allCandidates.size === 0) {
      console.log('⚠️ No candidates from external sources, using fallback...')
      fallbackCandidates = this.getFallbackCandidates()
      fallbackCandidates.forEach(c => allCandidates.add(c.name))
    }

    console.log(`📊 Total unique candidates: ${allCandidates.size}`)

    // Phase 2: Validation
    console.log('\n✅ Phase 2: Reddit Validation')
    const validatedSubreddits = await this.redditValidator.validateSubreddits(
      Array.from(allCandidates)
    )

    const validSubreddits = validatedSubreddits.filter(s => s.validation_status === 'valid')
    console.log(`✅ ${validSubreddits.length} valid subreddits found`)

    // Phase 3: AI Analysis & Categorization
    console.log('\n🤖 Phase 3: AI Analysis & Categorization')
    const recommendations = await this.aiAnalysis.categorizeSubreddits(
      validSubreddits,
      request.audience,
      request.problem,
      request.product,
      request.questions || ''
    )

    // Phase 4: Compile Results
    const results: DiscoveryResults = {
      candidates: [
        ...perplexityCandidates,
        ...firecrawlCandidates, 
        ...fallbackCandidates
      ],
      validated_subreddits: validatedSubreddits,
      recommendations,
      discovery_sources: {
        perplexity_count: perplexityCandidates.length,
        firecrawl_count: firecrawlCandidates.length,
        fallback_count: fallbackCandidates.length
      },
      summary: '', // Will be set below
      search_parameters: request
    }
    
    // Create summary after results object is complete
    results.summary = this.createDiscoverySummary(results, request, Date.now() - startTime)

    console.log('\n🎉 Discovery Complete!')
    console.log(`⏱️ Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`)
    console.log(`📈 Primary: ${recommendations.primary.length}, Secondary: ${recommendations.secondary.length}, Niche: ${recommendations.niche.length}`)

    return results
  }

  /**
   * Lightweight discovery for quick validation
   */
  async quickDiscovery(request: Pick<DiscoveryRequest, 'product' | 'audience'>): Promise<string[]> {
    try {
      // Use only Perplexity for quick discovery
      const candidates = await this.perplexityService.discoverSubreddits(
        request.audience,
        '', // No specific problem
        request.product,
        ''
      )

      return candidates.map(c => c.name).slice(0, 10) // Return top 10
    } catch (error) {
      console.error('Quick discovery failed:', error)
      return this.getFallbackCandidates().map(c => c.name).slice(0, 5)
    }
  }

  /**
   * Validate a specific list of subreddit names
   */
  async validateSpecificSubreddits(names: string[]): Promise<ValidatedSubreddit[]> {
    const validNames = names.filter(name => isValidSubredditName(name))
    return this.redditValidator.validateSubreddits(validNames)
  }

  /**
   * Get basic info for display purposes
   */
  async getSubredditInfo(name: string): Promise<{
    name: string
    subscribers: number
    description: string
  } | null> {
    return this.redditValidator.getSubredditInfo(name)
  }

  /**
   * Re-analyze existing subreddits with new criteria
   */
  async reanalyzeSubreddits(
    subreddits: ValidatedSubreddit[],
    newCriteria: Pick<DiscoveryRequest, 'product' | 'problem' | 'audience' | 'questions'>
  ) {
    return this.aiAnalysis.categorizeSubreddits(
      subreddits,
      newCriteria.audience,
      newCriteria.problem,
      newCriteria.product,
      newCriteria.questions || ''
    )
  }

  private getFallbackCandidates(): SubredditCandidate[] {
    const fallbackNames = [
      'entrepreneur', 'startups', 'smallbusiness', 'marketing',
      'business', 'SaaS', 'digitalnomad', 'freelance',
      'webdev', 'programming', 'artificial', 'MachineLearning',
      'productivity', 'selfimprovement', 'getmotivated'
    ]

    return fallbackNames.map(name => ({
      name,
      source: 'fallback' as const,
      relevance_reason: 'General business/tech community',
      confidence: 0.3
    }))
  }

  private createDiscoverySummary(
    results: Partial<DiscoveryResults>, 
    request: DiscoveryRequest, 
    durationMs: number
  ): string {
    const totalValid = results.validated_subreddits?.filter(s => s.validation_status === 'valid').length || 0
    const totalCandidates = results.candidates?.length || 0
    const sources = results.discovery_sources

    return `
Enhanced Subreddit Discovery Summary

🔍 Discovery Sources:
- Perplexity AI: ${sources?.perplexity_count || 0} candidates
- Firecrawl Search: ${sources?.firecrawl_count || 0} candidates  
- Fallback: ${sources?.fallback_count || 0} candidates
- Total Candidates: ${totalCandidates}
- Valid Subreddits: ${totalValid}

📊 Final Recommendations:
- Primary Communities: ${results.recommendations?.primary.length || 0}
- Secondary Communities: ${results.recommendations?.secondary.length || 0}
- Niche Communities: ${results.recommendations?.niche.length || 0}

🎯 Search Parameters:
- Product: ${request.product}
- Problem: ${request.problem}
- Audience: ${request.audience}

⏱️ Processing Time: ${(durationMs / 1000).toFixed(1)} seconds
    `.trim()
  }

  /**
   * Health check for all services
   */
  async healthCheck(): Promise<{
    reddit: boolean
    perplexity: boolean
    firecrawl: boolean
    ai_analysis: boolean
    overall: boolean
  }> {
    const health = {
      reddit: false,
      perplexity: false,
      firecrawl: false,
      ai_analysis: false,
      overall: false
    }

    try {
      // Test Reddit API
      health.reddit = await this.redditValidator.subredditExists('programming')
    } catch {
      health.reddit = false
    }

    try {
      // Test Perplexity
      health.perplexity = await this.perplexityService.healthCheck()
    } catch {
      health.perplexity = false
    }

    try {
      // Test Firecrawl
      health.firecrawl = await this.firecrawlService.healthCheck()
    } catch {
      health.firecrawl = false
    }

    try {
      // Test AI Analysis
      await this.aiAnalysis.makeAICall([
        { role: 'user', content: 'Say "OK" if you can respond.' }
      ])
      health.ai_analysis = true
    } catch {
      health.ai_analysis = false
    }

    health.overall = health.reddit && health.ai_analysis && (health.perplexity || health.firecrawl)

    return health
  }
}