import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  const { data, error } = await supabase
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
  const { data, error } = await supabase
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
    const category = searchParams.get('category')

    if (!runId) {
      return NextResponse.json(
        { error: 'run_id parameter is required' },
        { status: 400 }
      )
    }

    let quotes: QuoteWithAttribution[]
    
    if (category) {
      quotes = await getQuotesByCategory(runId, category)
    } else {
      quotes = await getQuotesWithAttribution(runId)
    }

    return NextResponse.json({
      success: true,
      quotes,
      count: quotes.length
    })

  } catch (error) {
    console.error('Error fetching quotes:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch quotes',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}