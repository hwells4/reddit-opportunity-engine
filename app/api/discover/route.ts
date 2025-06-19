import { NextRequest, NextResponse } from 'next/server'
import { DiscoveryOrchestrator, DiscoveryRequest } from '@/lib/discovery'

const orchestrator = new DiscoveryOrchestrator()

export async function POST(request: NextRequest) {
  try {
    const body: DiscoveryRequest = await request.json()
    
    // Validate required fields
    const requiredFields = ['audience', 'problem', 'product']
    for (const field of requiredFields) {
      if (!body[field as keyof DiscoveryRequest]) {
        return NextResponse.json(
          { 
            error: `Missing required field: ${field}`,
            required_fields: requiredFields
          },
          { status: 400 }
        )
      }
    }

    console.log('🚀 Starting discovery for:', {
      product: body.product,
      problem: body.problem,
      audience: body.audience
    })

    // Run full discovery process
    const results = await orchestrator.discoverSubreddits(body)

    // Format response to match existing enhanced-subreddit-discovery format
    return NextResponse.json({
      success: true,
      discovery_method: 'enhanced_ai_powered_modular',
      total_subreddits_found: results.validated_subreddits.filter(s => s.validation_status === 'valid').length,
      discovery_sources: results.discovery_sources,
      recommendations: results.recommendations,
      validated_subreddits: results.validated_subreddits,
      summary: results.summary,
      search_parameters: results.search_parameters,
      candidates: results.candidates, // Include raw candidates for debugging
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Discovery error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error during subreddit discovery',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Health check endpoint
    const health = await orchestrator.healthCheck()
    
    return NextResponse.json({
      status: health.overall ? 'healthy' : 'degraded',
      services: health,
      capabilities: [
        'agentic_perplexity_discovery',
        'agentic_firecrawl_search', 
        'real_reddit_validation',
        'ai_powered_categorization',
        'multi_source_deduplication'
      ],
      advantages: [
        'AI generates intelligent search queries (not hardcoded)',
        'Real Reddit API validation with actual subscriber counts',
        'Proper rate limiting and error handling',
        'Modular, testable architecture',
        'Human-in-the-loop selection support'
      ]
    })
    
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error',
        error: 'Failed to check discovery service health',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}