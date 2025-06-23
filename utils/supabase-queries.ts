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

/**
 * Get all quotes with their Reddit links for a specific run
 * This replaces your Python script that searches through Google Sheets
 */
export async function getQuotesWithAttribution(runId: string): Promise<QuoteWithAttribution[]> {
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

  // Transform the data for easy use
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

/**
 * Get quotes by category with attribution
 */
export async function getQuotesByCategory(runId: string, category: string): Promise<QuoteWithAttribution[]> {
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

/**
 * Get summary statistics for a run
 */
export async function getRunStats(runId: string) {
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

/**
 * Export function that matches your current Python script output
 */
export async function exportQuotesForReport(runId: string): Promise<string> {
  const quotes = await getQuotesWithAttribution(runId)
  const stats = await getRunStats(runId)
  
  // Create CSV-like output similar to your current system
  const headers = ['quote_id', 'text', 'category', 'theme', 'reddit_url', 'subreddit', 'post_title']
  const rows = quotes.map(quote => [
    quote.quote_id,
    `"${quote.text.replace(/"/g, '""')}"`, // Escape quotes
    quote.category,
    quote.theme || '',
    quote.reddit_url,
    quote.subreddit,
    `"${quote.post_title.replace(/"/g, '""')}"`
  ])

  const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
  
  return csv
} 