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

export interface QuoteWithAttribution {
  quote_id: string
  text: string
  category: string
  context?: string
  sentiment?: string
  theme?: string
  relevance_score?: number
  reddit_url: string
  post_title: string
  subreddit: string
  post_id: string
}

async function getQuotesWithAttribution(runId: string): Promise<QuoteWithAttribution[]> {
  const { data, error } = await getSupabaseClient()
    .from('quotes')
    .select(`
      quote_id,
      text,
      category,
      context,
      sentiment,
      theme,
      relevance_score,
      posts (
        post_id,
        url,
        title,
        subreddit
      )
    `)
    .eq('run_id', runId)
    .order('quote_id')

  if (error) {
    throw new Error(`Failed to fetch quotes: ${error.message}`)
  }

  return data.map(quote => ({
    quote_id: quote.quote_id,
    text: quote.text,
    category: quote.category,
    context: quote.context,
    sentiment: quote.sentiment,
    theme: quote.theme,
    relevance_score: quote.relevance_score,
    reddit_url: (quote.posts as any).url,
    post_title: (quote.posts as any).title,
    subreddit: (quote.posts as any).subreddit,
    post_id: (quote.posts as any).post_id
  }))
}

async function getQuotesByCategory(runId: string, category: string): Promise<QuoteWithAttribution[]> {
  const { data, error } = await getSupabaseClient()
    .from('quotes')
    .select(`
      quote_id,
      text,
      category,
      context,
      sentiment,
      theme,
      relevance_score,
      posts (
        post_id,
        url,
        title,
        subreddit
      )
    `)
    .eq('run_id', runId)
    .eq('category', category)
    .order('quote_id')

  if (error) {
    throw new Error(`Failed to fetch quotes by category: ${error.message}`)
  }

  return data.map(quote => ({
    quote_id: quote.quote_id,
    text: quote.text,
    category: quote.category,
    context: quote.context,
    sentiment: quote.sentiment,
    theme: quote.theme,
    relevance_score: quote.relevance_score,
    reddit_url: (quote.posts as any).url,
    post_title: (quote.posts as any).title,
    subreddit: (quote.posts as any).subreddit,
    post_id: (quote.posts as any).post_id
  }))
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const runId = searchParams.get('run_id')
    const postId = searchParams.get('post_id')
    const category = searchParams.get('category')
    const limit = searchParams.get('limit') || '100'
    const offset = searchParams.get('offset') || '0'

    if (!runId) {
      return NextResponse.json(
        { success: false, error: 'run_id parameter is required' },
        { status: 400 }
      )
    }

    // Base query for posts with run_id
    let postsQuery = getSupabaseClient()
      .from('posts')
      .select('*')
      .eq('run_id', runId)
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)
      .order('start_time', { ascending: false })

    // Filter by post_id if provided
    if (postId) {
      postsQuery = postsQuery.eq('post_id', postId)
    }

    const { data: posts, error: postsError } = await postsQuery

    if (postsError) {
      console.error('Error fetching posts:', postsError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch posts' },
        { status: 500 }
      )
    }

    // Base query for quotes with run_id
    let quotesQuery = getSupabaseClient()
      .from('quotes')
      .select('*')
      .eq('run_id', runId)
      .order('start_time', { ascending: false })

    // Filter by post_id if provided
    if (postId) {
      quotesQuery = quotesQuery.eq('post_id', postId)
    }

    // Filter by category if provided
    if (category) {
      quotesQuery = quotesQuery.eq('category', category)
    }

    const { data: quotes, error: quotesError } = await quotesQuery

    if (quotesError) {
      console.error('Error fetching quotes:', quotesError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch quotes' },
        { status: 500 }
      )
    }

    // Get run information
    const { data: runInfo, error: runError } = await getSupabaseClient()
      .from('runs')
      .select('*')
      .eq('run_id', runId)
      .single()

    if (runError) {
      console.error('Error fetching run info:', runError)
    }

    // Create summary statistics
    const categoryCounts = quotes.reduce((acc: Record<string, number>, quote: any) => {
      const category = quote.category || 'uncategorized'
      acc[category] = (acc[category] || 0) + 1
      return acc
    }, {})

    const summary = {
      total_posts: posts.length,
      total_quotes: quotes.length,
      categories: categoryCounts,
      run_info: runInfo || null,
      filters_applied: {
        run_id: runId,
        post_id: postId || null,
        category: category || null,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    }

    // Group quotes by post_id for easier attribution
    const quotesByPost = quotes.reduce((acc: Record<string, any[]>, quote: any) => {
      const postId = quote.post_id
      if (!acc[postId]) {
        acc[postId] = []
      }
      acc[postId].push(quote)
      return acc
    }, {})

    // Add quotes to posts for complete attribution
    const postsWithQuotes = posts.map((post: any) => ({
      ...post,
      quotes: quotesByPost[post.post_id] || []
    }))

    return NextResponse.json({
      success: true,
      run_id: runId,
      posts: postsWithQuotes,
      quotes,
      quotes_by_post: quotesByPost,
      summary
    })

  } catch (error) {
    console.error('Unexpected error in quotes endpoint:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { run_id, post_ids, categories, search_text } = body

    if (!run_id) {
      return NextResponse.json(
        { success: false, error: 'run_id is required' },
        { status: 400 }
      )
    }

    // Build dynamic query for quotes
    let quotesQuery = getSupabaseClient()
      .from('quotes')
      .select('*')
      .eq('run_id', run_id)

    // Filter by post_ids if provided
    if (post_ids && Array.isArray(post_ids) && post_ids.length > 0) {
      quotesQuery = quotesQuery.in('post_id', post_ids)
    }

    // Filter by categories if provided
    if (categories && Array.isArray(categories) && categories.length > 0) {
      quotesQuery = quotesQuery.in('category', categories)
    }

    // Text search if provided
    if (search_text) {
      quotesQuery = quotesQuery.ilike('text', `%${search_text}%`)
    }

    const { data: quotes, error: quotesError } = await quotesQuery

    if (quotesError) {
      console.error('Error fetching filtered quotes:', quotesError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch filtered quotes' },
        { status: 500 }
      )
    }

    // Get related posts
    const postIds = [...new Set(quotes.map((quote: any) => quote.post_id))]
    const { data: posts, error: postsError } = await getSupabaseClient()
      .from('posts')
      .select('*')
      .in('post_id', postIds)

    if (postsError) {
      console.error('Error fetching related posts:', postsError)
    }

    return NextResponse.json({
      success: true,
      run_id,
      quotes,
      related_posts: posts || [],
      filters_applied: { run_id, post_ids, categories, search_text },
      total_results: quotes.length
    })

  } catch (error) {
    console.error('Unexpected error in quotes POST endpoint:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}