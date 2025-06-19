import { AIMessage, AIModelConfig, SubredditRecommendation, ValidatedSubreddit, DiscoveryError } from './types'

// OpenRouter client configuration (not OpenAI!)
class OpenRouterClient {
  private apiKey: string
  private baseURL = "https://openrouter.ai/api/v1"

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || ''
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required')
    }
  }

  async createChatCompletion(options: {
    model: string
    messages: AIMessage[]
    max_tokens?: number
    temperature?: number
  }) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://reddit-opportunity-engine.com',
        'X-Title': 'Reddit Opportunity Engine'
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        max_tokens: options.max_tokens || 3000,
        temperature: options.temperature || 0.2,
        stream: false
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenRouter API error ${response.status}: ${error}`)
    }

    return response.json()
  }
}

export class AIAnalysisService {
  private openRouter: OpenRouterClient
  private modelConfig: AIModelConfig

  constructor(modelConfig?: Partial<AIModelConfig>) {
    this.openRouter = new OpenRouterClient()
    
    // Use OpenRouter models, prioritizing Claude and GPT-4
    this.modelConfig = {
      models: [
        "anthropic/claude-3-5-sonnet",
        "openai/gpt-4-turbo",
        "openai/gpt-4o-mini", 
        "anthropic/claude-3-haiku",
        "openai/gpt-3.5-turbo"
      ],
      max_tokens: 3000,
      temperature: 0.2,
      fallback_enabled: true,
      ...modelConfig
    }
  }

  /**
   * Make AI call with model fallback logic
   */
  async makeAICall(messages: AIMessage[], options?: {
    max_tokens?: number
    temperature?: number
    requireJSON?: boolean
  }): Promise<string> {
    const { max_tokens, temperature, requireJSON } = options || {}

    for (let i = 0; i < this.modelConfig.models.length; i++) {
      const model = this.modelConfig.models[i]
      
      try {
        console.log(`🤖 Trying ${model}...`)
        
        const response = await this.openRouter.createChatCompletion({
          model,
          messages,
          max_tokens: max_tokens || this.modelConfig.max_tokens,
          temperature: temperature || this.modelConfig.temperature
        })

        const content = response.choices[0]?.message?.content
        if (!content) {
          throw new Error('Empty response from AI model')
        }

        console.log(`✅ Success with ${model}`)

        // If JSON is required, validate it
        if (requireJSON) {
          try {
            JSON.parse(this.extractJSON(content))
          } catch {
            throw new Error('Response is not valid JSON')
          }
        }

        return content

      } catch (error) {
        console.log(`❌ ${model} failed:`, error instanceof Error ? error.message : 'Unknown error')
        
        if (i === this.modelConfig.models.length - 1) {
          throw new DiscoveryError(
            `All AI models failed. Last error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'ai_analysis',
            error instanceof Error ? error : undefined
          )
        }
      }
    }

    throw new DiscoveryError('No AI models available', 'ai_analysis')
  }

  /**
   * Generate intelligent search queries for external services
   * This replaces hardcoded queries - let AI be creative!
   */
  async generateSearchQueries(
    audience: string,
    problem: string, 
    product: string,
    questions: string,
    searchType: 'perplexity' | 'firecrawl'
  ): Promise<string[]> {
    const systemPrompt = searchType === 'perplexity' 
      ? "You are a Reddit community discovery expert who understands how different audiences cluster into specific subreddits. Your goal is to find the EXACT communities where the target audience actively discusses their specific problems and needs."
      : "You are an expert at crafting web search queries for finding Reddit discussions. Create queries that will find actual Reddit posts and comments about the topic."

    const userPrompt = `
Product: ${product}
Problem: ${problem}  
Audience: ${audience}
Questions: ${questions}

Generate 6-8 ${searchType === 'perplexity' ? 'highly targeted search queries for Perplexity AI' : 'web search queries'} to find the most relevant Reddit communities for this specific product/audience combination.

${searchType === 'perplexity' 
  ? `CRITICAL: Focus on finding subreddits where ${audience} specifically gather to discuss ${problem}. Think about:
1. Professional/industry-specific communities for this audience
2. Tool-specific communities where they seek solutions
3. Communities focused on the exact problem/pain point
4. Niche communities for advanced practitioners in this space
5. Communities where they ask the specific questions mentioned
6. Adjacent problem areas that lead to the same solution

Be highly specific - avoid generic business/startup subreddits unless they're the primary audience. Look for communities that match the exact intersection of audience + problem + questions.`
  : 'Include "site:reddit.com" in your queries. Focus on finding actual discussions, questions, and conversations about this topic.'
}

Return ONLY a JSON array of query strings, no other text:
["query1", "query2", "query3", ...]
`

    try {
      const response = await this.makeAICall([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { requireJSON: true })

      const queries = JSON.parse(this.extractJSON(response))
      return Array.isArray(queries) ? queries : []
    } catch (error) {
      console.error('Failed to generate AI queries, using fallback:', error)
      
      // Fallback queries if AI fails
      if (searchType === 'perplexity') {
        return [
          `What are the best Reddit communities for ${audience} dealing with ${problem}?`,
          `Which subreddits discuss ${product} and similar solutions?`,
          `Reddit communities for ${audience} seeking help with ${problem}`,
          `Best subreddits for ${product} users and ${audience}`
        ]
      } else {
        return [
          `${product} ${problem} site:reddit.com`,
          `${audience} ${problem} reddit discussion`,
          `"${problem}" help reddit community`,
          `best subreddit ${audience} ${product}`
        ]
      }
    }
  }

  /**
   * Analyze and categorize discovered subreddits using AI
   */
  async categorizeSubreddits(
    validatedSubreddits: ValidatedSubreddit[],
    audience: string,
    problem: string,
    product: string,
    questions: string
  ): Promise<{
    primary: SubredditRecommendation[]
    secondary: SubredditRecommendation[]
    niche: SubredditRecommendation[]
  }> {
    if (!validatedSubreddits.length) {
      return { primary: [], secondary: [], niche: [] }
    }

    const subredditData = validatedSubreddits.map(sub => ({
      name: sub.name,
      subscribers: sub.subscribers,
      description: sub.description.slice(0, 200), // Truncate for token limits
      is_active: sub.is_active
    }))

    const prompt = `
Analyze these Reddit communities for a ${product} targeting ${audience} who struggle with ${problem}.

Subreddits to analyze:
${JSON.stringify(subredditData, null, 2)}

Questions they ask: ${questions}

Categorize into:
1. PRIMARY: Highest relevance, direct target audience, perfect fit
2. SECONDARY: Good relevance, broader audience, still valuable 
3. NICHE: Specific use cases, smaller but highly targeted segments

For each subreddit provide:
- Relevance score (1-10)
- Specific reason why it's relevant
- Recommended engagement approach for this community

Return JSON in this exact format:
{
  "primary": [
    {
      "name": "subreddit_name",
      "relevance_score": 9,
      "relevance_reason": "specific detailed reason",
      "engagement_approach": "specific strategy for this community"
    }
  ],
  "secondary": [...],
  "niche": [...]
}
`

    try {
      const response = await this.makeAICall([
        {
          role: 'system',
          content: 'You are a Reddit marketing expert with deep knowledge of community dynamics. Analyze subreddits strategically based on audience fit, community culture, and engagement potential.'
        },
        { role: 'user', content: prompt }
      ], { requireJSON: true })

      const recommendations = JSON.parse(this.extractJSON(response))
      
      // Add category and subscriber info to each recommendation
      const addCategoryInfo = (recs: any[], category: 'primary' | 'secondary' | 'niche') => 
        recs.map(rec => {
          const subreddit = validatedSubreddits.find(s => s.name === rec.name)
          return {
            ...rec,
            category,
            subscribers: subreddit?.subscribers || 0,
            confidence: category === 'primary' ? 0.9 : category === 'secondary' ? 0.7 : 0.5
          }
        })

      return {
        primary: addCategoryInfo(recommendations.primary || [], 'primary'),
        secondary: addCategoryInfo(recommendations.secondary || [], 'secondary'),
        niche: addCategoryInfo(recommendations.niche || [], 'niche')
      }

    } catch (error) {
      console.error('AI categorization failed, using fallback:', error)
      return this.createFallbackCategorization(validatedSubreddits)
    }
  }

  private createFallbackCategorization(validatedSubreddits: ValidatedSubreddit[]) {
    // Sort by subscriber count and activity
    const sorted = validatedSubreddits
      .sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0) || b.subscribers - a.subscribers)

    const recommendations = {
      primary: [] as SubredditRecommendation[],
      secondary: [] as SubredditRecommendation[],
      niche: [] as SubredditRecommendation[]
    }

    sorted.forEach((sub, i) => {
      const category: 'primary' | 'secondary' | 'niche' = 
        i < 3 ? 'primary' : i < 8 ? 'secondary' : 'niche'

      recommendations[category].push({
        name: sub.name,
        relevance_score: Math.max(5, 10 - i),
        relevance_reason: `Active community with ${sub.subscribers.toLocaleString()} subscribers`,
        engagement_approach: 'Research community guidelines and engage authentically',
        category,
        subscribers: sub.subscribers,
        confidence: 0.5
      })
    })

    return recommendations
  }

  private extractJSON(text: string): string {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/)
    if (jsonMatch) {
      return jsonMatch[1]
    }

    // Try to extract raw JSON object
    const objMatch = text.match(/\{[\s\S]*\}/)
    if (objMatch) {
      return objMatch[0]
    }

    // Try to extract JSON array
    const arrayMatch = text.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      return arrayMatch[0]
    }

    return text
  }
}