import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface CreateRunRequest {
  user_question?: string
  problem_area?: string
  target_audience?: string
  product_type?: string
  product_name?: string
  subreddits?: string[]
  user_id?: string // For future multi-user support
}

async function getRunStats(runId: string) {
  const { data: run, error: runError } = await supabase
    .from('runs')
    .select('*')
    .eq('run_id', runId)
    .single()

  if (runError) {
    throw new Error(`Failed to fetch run: ${runError.message}`)
  }

  const { data: quoteCounts, error: countError } = await supabase
    .from('quotes')
    .select('category')
    .eq('run_id', runId)

  if (countError) {
    throw new Error(`Failed to fetch quote counts: ${countError.message}`)
  }

  // Count quotes by category
  const categoryStats = quoteCounts.reduce((acc, quote) => {
    acc[quote.category] = (acc[quote.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return {
    ...run,
    category_breakdown: categoryStats,
    total_quotes: quoteCounts.length
  }
}

async function getAllRuns(userId?: string) {
  let query = supabase
    .from('runs')
    .select('*')
    .order('created_at', { ascending: false })

  // Add user filtering for future multi-user support
  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data: runs, error } = await query

  if (error) {
    throw new Error(`Failed to fetch runs: ${error.message}`)
  }

  return runs
}

// GET - Read run data and metadata
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const runId = searchParams.get('run_id')
    const userId = searchParams.get('user_id') // For future multi-user support

    if (runId) {
      // Get specific run stats
      const stats = await getRunStats(runId)
      return NextResponse.json({
        success: true,
        run_stats: stats
      })
    } else {
      // Get all runs (optionally filtered by user)
      const runs = await getAllRuns(userId || undefined)
      return NextResponse.json({
        success: true,
        runs,
        count: runs.length
      })
    }

  } catch (error) {
    console.error('Error fetching run data:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch run data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// POST - Create new run
export async function POST(request: NextRequest) {
  try {
    const body: CreateRunRequest = await request.json()
    
    // Create run record
    const { data: run, error: runError } = await supabase
      .from('runs')
      .insert({
        status: 'processing',
        user_question: body.user_question,
        problem_area: body.problem_area,
        target_audience: body.target_audience,
        product_type: body.product_type,
        product_name: body.product_name,
        subreddits: body.subreddits,
        user_id: body.user_id, // For future multi-user support
        posts_analyzed_count: 0,
        quotes_extracted_count: 0
      })
      .select('run_id')
      .single()

    if (runError) {
      console.error('Error creating run:', runError)
      return NextResponse.json({ error: 'Failed to create run' }, { status: 500 })
    }

    return NextResponse.json({ 
      run_id: run.run_id,
      status: 'created',
      message: 'Run created successfully'
    })

  } catch (error) {
    console.error('Create run error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}