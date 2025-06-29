/**
 * API route for validating the existence and status of Reddit subreddits.
 * This endpoint leverages the `RedditValidator` service to interact with the
 * official Reddit API, providing robust checks with built-in rate limiting.
 *
 * It offers two methods for validation:
 * - POST /api/discover/validate:
 *   Accepts a JSON body with an array of up to 50 subreddit names (`subreddit_names`).
 *   It performs a comprehensive validation for each, returning a detailed
 *   list of results with statuses like 'valid', 'private', 'not_found', or 'error'.
 *   A summary of the validation counts is also included.
 *
 * - GET /api/discover/validate?name=<subreddit_name>:
 *   A quick, lightweight method to fetch basic public information (name, subscribers,
 *   description) for a single subreddit. Useful for quick lookups.
 */
import { NextRequest, NextResponse } from 'next/server'
import { RedditValidator } from '@/lib/discovery'

const validator = new RedditValidator()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subreddit_names } = body

    if (!subreddit_names || !Array.isArray(subreddit_names)) {
      return NextResponse.json(
        { error: 'subreddit_names array is required' },
        { status: 400 }
      )
    }

    if (subreddit_names.length === 0) {
      return NextResponse.json(
        { error: 'At least one subreddit name is required' },
        { status: 400 }
      )
    }

    if (subreddit_names.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 subreddits can be validated at once' },
        { status: 400 }
      )
    }

    console.log(`🔍 Validating ${subreddit_names.length} subreddits...`)

    const validatedSubreddits = await validator.validateSubreddits(subreddit_names)
    
    const summary = {
      total_requested: subreddit_names.length,
      total_validated: validatedSubreddits.length,
      valid_count: validatedSubreddits.filter(s => s.validation_status === 'valid').length,
      private_count: validatedSubreddits.filter(s => s.validation_status === 'private').length,
      not_found_count: validatedSubreddits.filter(s => s.validation_status === 'not_found').length,
      error_count: validatedSubreddits.filter(s => s.validation_status === 'error').length
    }

    return NextResponse.json({
      success: true,
      validated_subreddits: validatedSubreddits,
      summary,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Validation error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error during validation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subredditName = searchParams.get('name')

    if (!subredditName) {
      return NextResponse.json(
        { error: 'subreddit name is required as query parameter (?name=subreddit)' },
        { status: 400 }
      )
    }

    console.log(`🔍 Quick validation for r/${subredditName}`)

    const info = await validator.getSubredditInfo(subredditName)
    
    if (!info) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Subreddit not found or invalid name format'
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      subreddit: info,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Quick validation error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error during quick validation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}