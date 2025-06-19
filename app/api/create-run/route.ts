import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateRunRequest = await request.json()
    
    // Create run record first
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
        posts_analyzed_count: 0,
        quotes_extracted_count: 0
      })
      .select('run_id')
      .single()

    if (runError) {
      console.error('Error creating run:', runError)
      return NextResponse.json({ error: 'Failed to create run' }, { status: 500 })
    }

    // Return run_id for Gumloop to use
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