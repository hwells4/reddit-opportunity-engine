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