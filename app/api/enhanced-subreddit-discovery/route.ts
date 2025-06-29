/**
 * API route that acts as a "backend-for-frontend" (BFF) proxy to an external,
 * standalone "Enhanced Discovery Service". This route facilitates communication
 * between the main application and a separate microservice responsible for
 * subreddit discovery.
 *
 * NOTE: This appears to be an alternative or possibly legacy implementation
 * compared to the more integrated `/api/discover` route, which contains its
 * orchestration logic within this application's codebase.
 *
 * - POST /api/enhanced-subreddit-discovery:
 *   Accepts a discovery request and forwards it to the external service.
 *   - It validates the incoming request body.
 *   - It calls the `/enhanced-discover` endpoint on the external service.
 *   - It then receives the response and transforms it into a format suitable
 *     for this application's frontend, insulating the client from the specific
 *     data structure of the downstream service.
 *
 * - GET /api/enhanced-subreddit-discovery:
 *   Acts as a health check for the external discovery service.
 *   - It calls the `/enhanced-discover/health` endpoint on the external service
 *     and returns a status indicating whether the service is available and healthy.
 */
import { NextResponse } from "next/server";

interface DiscoveryRequest {
  product_type: string;
  problem_area: string;
  target_audience: string;
  additional_context?: string;
}

interface EnhancedDiscoveryResponse {
  success: boolean;
  discovery_method: string;
  total_subreddits_found: number;
  discovery_sources: {
    perplexity_count: number;
    firecrawl_count: number;
  };
  recommendations: {
    primary: Array<{
      name: string;
      relevance_score: number;
      relevance_reason: string;
      engagement_approach: string;
    }>;
    secondary: Array<{
      name: string;
      relevance_score: number;
      relevance_reason: string;
      engagement_approach: string;
    }>;
    niche: Array<{
      name: string;
      relevance_score: number;
      relevance_reason: string;
      engagement_approach: string;
    }>;
  };
  validated_subreddits: Array<{
    name: string;
    subscribers: number;
    description: string;
    is_active: boolean;
    over_18: boolean;
    validation_status: string;
  }>;
  summary: string;
  search_parameters: DiscoveryRequest;
}

export async function POST(request: Request) {
  try {
    const body: DiscoveryRequest = await request.json();
    
    // Validate required fields
    const requiredFields = ['product_type', 'problem_area', 'target_audience'];
    for (const field of requiredFields) {
      if (!body[field as keyof DiscoveryRequest]) {
        return NextResponse.json(
          { 
            error: `Missing required field: ${field}`,
            required_fields: requiredFields
          },
          { status: 400 }
        );
      }
    }

    // Call the enhanced discovery service
    const enhancedServiceUrl = process.env.ENHANCED_DISCOVERY_SERVICE_URL || 'http://localhost:5001';
    
    const response = await fetch(`${enhancedServiceUrl}/enhanced-discover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { 
          error: 'Enhanced discovery service failed',
          details: errorData
        },
        { status: response.status }
      );
    }

    const discoveryResults: EnhancedDiscoveryResponse = await response.json();

    // Format the results for the frontend
    const formattedResults = {
      success: true,
      method: 'enhanced_ai_powered',
      summary: {
        total_subreddits: discoveryResults.total_subreddits_found,
        discovery_sources: discoveryResults.discovery_sources,
        quality_indicators: {
          primary_communities: discoveryResults.recommendations.primary.length,
          secondary_communities: discoveryResults.recommendations.secondary.length,
          niche_communities: discoveryResults.recommendations.niche.length,
          ai_powered: true,
          multi_source: true
        }
      },
      recommendations: {
        primary: discoveryResults.recommendations.primary.map(rec => ({
          subreddit: `r/${rec.name}`,
          name: rec.name,
          relevance_score: rec.relevance_score,
          reason: rec.relevance_reason,
          approach: rec.engagement_approach,
          category: 'primary'
        })),
        secondary: discoveryResults.recommendations.secondary.map(rec => ({
          subreddit: `r/${rec.name}`,
          name: rec.name,
          relevance_score: rec.relevance_score,
          reason: rec.relevance_reason,
          approach: rec.engagement_approach,
          category: 'secondary'
        })),
        niche: discoveryResults.recommendations.niche.map(rec => ({
          subreddit: `r/${rec.name}`,
          name: rec.name,
          relevance_score: rec.relevance_score,
          reason: rec.relevance_reason,
          approach: rec.engagement_approach,
          category: 'niche'
        }))
      },
      validated_subreddits: discoveryResults.validated_subreddits,
      discovery_summary: discoveryResults.summary,
      search_parameters: discoveryResults.search_parameters,
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(formattedResults);

  } catch (error) {
    console.error('Enhanced subreddit discovery error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error during enhanced discovery',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Health check for the enhanced discovery service
    const enhancedServiceUrl = process.env.ENHANCED_DISCOVERY_SERVICE_URL || 'http://localhost:5001';
    
    const response = await fetch(`${enhancedServiceUrl}/enhanced-discover/health`);
    
    if (!response.ok) {
      return NextResponse.json(
        { 
          status: 'unhealthy',
          error: 'Enhanced discovery service is not responding'
        },
        { status: 503 }
      );
    }

    const healthData = await response.json();
    
    return NextResponse.json({
      status: 'healthy',
      enhanced_discovery_available: true,
      service_health: healthData,
      capabilities: [
        'perplexity_ai_discovery',
        'firecrawl_search',
        'ai_powered_recommendations',
        'multi_source_validation'
      ],
      advantages_over_original: [
        'Uses Perplexity AI for intelligent subreddit discovery',
        'Leverages Firecrawl for comprehensive Reddit search',
        'AI-powered relevance scoring and categorization',
        'Multi-source validation and deduplication',
        'Contextual engagement recommendations'
      ]
    });

  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error',
        error: 'Failed to check enhanced discovery service health',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 