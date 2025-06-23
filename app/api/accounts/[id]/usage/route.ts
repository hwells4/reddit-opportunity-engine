import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

interface UsageStats {
  account_id: string
  total_runs: number
  completed_runs: number
  running_runs: number
  failed_runs: number
  total_posts_analyzed: number
  total_quotes_extracted: number
  first_run_date: string | null
  last_run_date: string | null
  average_posts_per_run: number
  average_quotes_per_run: number
  run_history: RunSummary[]
}

interface RunSummary {
  run_id: string
  status: string
  start_time: string
  problem_area: string | null
  target_audience: string | null
  product_type: string | null
  posts_analyzed_count: number
  quotes_extracted_count: number
}

// GET - Account usage statistics and analytics
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = params.id
    const { searchParams } = new URL(request.url)
    const includeHistory = searchParams.get('include_history') !== 'false'
    const limit = parseInt(searchParams.get('limit') || '50')

    const supabase = getSupabaseClient()

    // Verify account exists
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('account_id, company_name, contact_name, email')
      .eq('account_id', accountId)
      .single()

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }

    // Get all runs for this account
    const { data: runs, error: runsError } = await supabase
      .from('runs')
      .select('run_id, status, start_time, problem_area, target_audience, product_type, posts_analyzed_count, quotes_extracted_count')
      .eq('account_id', accountId)
      .order('start_time', { ascending: false })
      .limit(includeHistory ? limit : 1000) // Get all for stats calculation

    if (runsError) {
      throw runsError
    }

    // Calculate usage statistics
    const totalRuns = runs.length
    const completedRuns = runs.filter(run => run.status === 'completed').length
    const runningRuns = runs.filter(run => run.status === 'running').length
    const failedRuns = runs.filter(run => run.status === 'failed').length

    const totalPosts = runs.reduce((sum, run) => sum + (run.posts_analyzed_count || 0), 0)
    const totalQuotes = runs.reduce((sum, run) => sum + (run.quotes_extracted_count || 0), 0)

    const firstRunDate = runs.length > 0 ? runs[runs.length - 1].start_time : null
    const lastRunDate = runs.length > 0 ? runs[0].start_time : null

    const averagePostsPerRun = totalRuns > 0 ? Math.round(totalPosts / totalRuns) : 0
    const averageQuotesPerRun = totalRuns > 0 ? Math.round(totalQuotes / totalRuns) : 0

    // Format run history for response
    const runHistory: RunSummary[] = includeHistory 
      ? runs.slice(0, limit).map(run => ({
          run_id: run.run_id,
          status: run.status,
          start_time: run.start_time,
          problem_area: run.problem_area,
          target_audience: run.target_audience,
          product_type: run.product_type,
          posts_analyzed_count: run.posts_analyzed_count || 0,
          quotes_extracted_count: run.quotes_extracted_count || 0
        }))
      : []

    const usageStats: UsageStats = {
      account_id: accountId,
      total_runs: totalRuns,
      completed_runs: completedRuns,
      running_runs: runningRuns,
      failed_runs: failedRuns,
      total_posts_analyzed: totalPosts,
      total_quotes_extracted: totalQuotes,
      first_run_date: firstRunDate,
      last_run_date: lastRunDate,
      average_posts_per_run: averagePostsPerRun,
      average_quotes_per_run: averageQuotesPerRun,
      run_history: runHistory
    }

    return NextResponse.json({
      success: true,
      account: {
        account_id: account.account_id,
        company_name: account.company_name,
        contact_name: account.contact_name,
        email: account.email
      },
      usage_stats: usageStats,
      generated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching account usage:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch account usage',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// POST - Calculate billing/cost estimates (for future use)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = params.id
    const body = await request.json() as { 
      cost_per_run?: number 
      cost_per_post?: number 
      cost_per_quote?: number 
    }

    const costPerRun = body.cost_per_run || 0
    const costPerPost = body.cost_per_post || 0  
    const costPerQuote = body.cost_per_quote || 0

    const supabase = getSupabaseClient()

    // Get usage stats
    const usageResponse = await GET(
      new NextRequest(request.url.replace('/usage', '/usage?include_history=false')),
      { params }
    )
    
    if (!usageResponse.ok) {
      return usageResponse
    }

    const usageData = await usageResponse.json()
    const stats = usageData.usage_stats as UsageStats

    // Calculate costs
    const runCost = stats.total_runs * costPerRun
    const postCost = stats.total_posts_analyzed * costPerPost
    const quoteCost = stats.total_quotes_extracted * costPerQuote
    const totalCost = runCost + postCost + quoteCost

    return NextResponse.json({
      success: true,
      account_id: accountId,
      cost_breakdown: {
        runs: {
          count: stats.total_runs,
          cost_per_unit: costPerRun,
          total_cost: runCost
        },
        posts: {
          count: stats.total_posts_analyzed,
          cost_per_unit: costPerPost,
          total_cost: postCost
        },
        quotes: {
          count: stats.total_quotes_extracted,
          cost_per_unit: costPerQuote,
          total_cost: quoteCost
        }
      },
      total_estimated_cost: totalCost,
      currency: 'USD',
      calculated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error calculating account costs:', error)
    return NextResponse.json(
      { 
        error: 'Failed to calculate account costs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}