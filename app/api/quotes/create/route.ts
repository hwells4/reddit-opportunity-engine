/**
 * API route for manually creating a single quote in the database.
 * This endpoint provides a convenient way to add one-off quotes that might be
 * discovered outside the automated data pipeline (e.g., by a user browsing Reddit).
 * It ensures that manually added data conforms to the required database schema.
 *
 * - POST /api/quotes/create:
 *   The primary functional endpoint for creating a quote.
 *   - Accepts a JSON body with `text` and `reddit_url` as the minimum required fields.
 *   - Automatically assigns default values for optional fields like `run_id` ('manual_entry')
 *     and `category` ('general') to ensure data consistency.
 *   - It intelligently attempts to `upsert` a corresponding record in the `posts` table
 *     to maintain relational integrity, even extracting the subreddit from the URL.
 *   - The main priority is to successfully insert the quote into the `quotes` table.
 *   - Returns the `quote_id` of the newly created record upon success.
 *
 * - GET /api/quotes/create:
 *   A self-documenting endpoint that provides information on how to use the POST method.
 *   It returns a JSON object detailing the required/optional fields and an example request body,
 *   making the API easier to discover and use for developers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

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

interface CreateQuoteRequest {
  text: string                    // REQUIRED: The quote text
  reddit_url: string             // REQUIRED: The Reddit link
  run_id?: string                // Optional: defaults to 'manual_entry'
  post_id?: string               // Optional: defaults to generated UUID
  category?: string              // Optional: defaults to 'general'
  sentiment?: string             // Optional: defaults to 'neutral'
  theme?: string                 // Optional: defaults to 'general'
  is_relevant?: boolean          // Optional: defaults to true
}

export async function POST(request: NextRequest) {
  try {
    const data: CreateQuoteRequest = await request.json()

    // Validate required fields
    if (!data.text || data.text.trim().length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Quote text is required'
      }, { status: 400 })
    }

    if (!data.reddit_url || !data.reddit_url.includes('reddit.com')) {
      return NextResponse.json({
        success: false,
        error: 'Valid Reddit URL is required'
      }, { status: 400 })
    }

    // Create the quote with defaults for optional fields
    const quote = {
      quote_id: randomUUID(),
      post_id: data.post_id || randomUUID(),
      run_id: data.run_id || 'manual_entry',
      text: data.text.trim(),
      category: data.category || 'general',
      context: (data.is_relevant !== false) ? 'relevant' : 'not_relevant',
      sentiment: data.sentiment || 'neutral',
      theme: data.theme || 'general',
      relevance_score: (data.is_relevant !== false) ? 1.0 : 0.0
    }

    // Create a minimal post record if post_id doesn't exist
    const supabase = getSupabaseClient()
    
    // Extract subreddit from URL
    const urlMatch = data.reddit_url.match(/reddit\.com\/r\/([^\/]+)/)
    const subreddit = urlMatch ? urlMatch[1] : 'unknown'

    // Try to create/update post record
    const { error: postError } = await supabase
      .from('posts')
      .upsert({
        post_id: quote.post_id,
        subreddit: subreddit,
        url: data.reddit_url,
        title: `Manual entry for quote: ${quote.quote_id}`,
        body: 'Manually created post for quote',
        run_id: quote.run_id,
        relevance_score: 1.0,
        classification_justification: 'Manual entry'
      })

    if (postError) {
      console.warn('Failed to create post record:', postError)
      // Continue anyway - quote is more important
    }

    // Insert the quote
    const { error: quoteError } = await supabase
      .from('quotes')
      .insert(quote)

    if (quoteError) {
      return NextResponse.json({
        success: false,
        error: 'Failed to create quote',
        details: quoteError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      quote_id: quote.quote_id,
      quote: {
        text: quote.text,
        category: quote.category,
        sentiment: quote.sentiment,
        theme: quote.theme,
        reddit_url: data.reddit_url,
        is_relevant: data.is_relevant !== false
      }
    })

  } catch (error: any) {
    console.error('Create quote error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error.message
    }, { status: 500 })
  }
}

// GET endpoint to show how to use this API
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/quotes/create',
    description: 'Create a quote with minimal required information',
    required_fields: {
      text: 'The quote text (string)',
      reddit_url: 'The Reddit URL (string)'
    },
    optional_fields: {
      run_id: 'Run identifier (string, defaults to "manual_entry")',
      post_id: 'Post identifier (string, defaults to generated UUID)',
      category: 'Quote category (string, defaults to "general")',
      sentiment: 'Quote sentiment (string, defaults to "neutral")',
      theme: 'Quote theme (string, defaults to "general")',
      is_relevant: 'Relevance flag (boolean, defaults to true)'
    },
    example_request: {
      text: "I really need a better way to organize my tasks",
      reddit_url: "https://www.reddit.com/r/productivity/comments/example123/",
      category: "user_needs",
      sentiment: "frustrated",
      theme: "organization"
    }
  })
}