/**
 * API route for monitoring the health and performance of the quote parsing system.
 * This endpoint provides visibility into the system's operational status,
 * including success rates, error patterns, AI usage costs, and data preservation metrics.
 *
 * It supports different views for focused analysis:
 * - GET /api/monitor?view=health:  Returns key performance indicators and system status (healthy, degraded, critical).
 * - GET /api/monitor?view=errors:  Provides a breakdown of common errors and actionable recommendations.
 * - GET /api/monitor?view=full:    Combines both health and error analysis for a complete overview.
 *
 * It also supports administrative actions:
 * - POST /api/monitor with { "action": "reset" }: Resets all collected metrics to their initial state.
 *
 * The underlying `ProcessingMonitor` class aggregates data from various processing runs
 * to provide these insights.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ProcessingMonitor } from '../../../utils/processing-monitor'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'health'

    switch (view) {
      case 'health':
        const health = ProcessingMonitor.getHealthMetrics()
        return NextResponse.json({
          status: health.status,
          alerts: health.alerts,
          summary: {
            total_runs: health.totalRuns,
            total_posts: health.totalPosts,
            total_quotes: health.totalQuotes,
            success_rates: health.successRates,
            average_quotes_per_post: health.averageQuotesPerPost.toFixed(2),
            last_updated: health.timestamp
          },
          fallback_usage: health.fallbackUsage,
          ai_extraction: {
            times_used: health.aiExtractionUsage.timesUsed,
            quotes_extracted: health.aiExtractionUsage.quotesExtracted,
            total_cost: `$${health.aiExtractionUsage.totalCost.toFixed(4)}`,
            average_cost_per_extraction: `$${health.aiExtractionUsage.averageCostPerExtraction.toFixed(4)}`,
            usage_rate: health.totalPosts > 0 ? `${((health.aiExtractionUsage.timesUsed / health.totalPosts) * 100).toFixed(1)}%` : '0%'
          },
          error_summary: health.errorBreakdown
        })

      case 'errors':
        const errorAnalysis = ProcessingMonitor.getErrorAnalysis()
        return NextResponse.json({
          error_breakdown: errorAnalysis.errorBreakdown,
          common_patterns: errorAnalysis.commonPatterns,
          recommendations: errorAnalysis.recommendations
        })

      case 'full':
        const fullMetrics = ProcessingMonitor.getHealthMetrics()
        const fullErrors = ProcessingMonitor.getErrorAnalysis()
        return NextResponse.json({
          health: fullMetrics,
          error_analysis: fullErrors
        })

      default:
        return NextResponse.json({
          error: 'Invalid view parameter',
          available_views: ['health', 'errors', 'full']
        }, { status: 400 })
    }

  } catch (error: any) {
    console.error('Monitor endpoint error:', error)
    return NextResponse.json({
      error: 'Failed to retrieve monitoring data',
      details: error.message
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()

    if (action === 'reset') {
      ProcessingMonitor.reset()
      return NextResponse.json({
        success: true,
        message: 'Monitoring metrics reset successfully'
      })
    }

    return NextResponse.json({
      error: 'Invalid action',
      available_actions: ['reset']
    }, { status: 400 })

  } catch (error: any) {
    console.error('Monitor POST error:', error)
    return NextResponse.json({
      error: 'Failed to process monitoring action',
      details: error.message
    }, { status: 500 })
  }
}