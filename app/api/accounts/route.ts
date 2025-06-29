/**
 * API route providing comprehensive CRUD (Create, Read, Update) functionality
 * for managing user or client "accounts" in the Supabase database. This serves as
 * the primary administrative endpoint for the `accounts` resource.
 *
 * - GET /api/accounts:
 *   A flexible read endpoint with two modes:
 *   1.  **Get Single Account with Stats (`?account_id=...`)**: Fetches full details
 *       for a specific account and enriches the response with calculated
 *       `usage_stats` (total runs, posts analyzed, etc.) by querying the `runs` table.
 *       Ideal for a detailed client dashboard view.
 *   2.  **List & Search Accounts**: Without an `account_id`, it returns a paginated
 *       list of all active accounts. It also supports a `search` parameter to filter
 *       results across multiple fields (company name, contact name, email).
 *
 * - POST /api/accounts:
 *   Creates a new account with robust validation.
 *   - It validates required fields, checks for a valid email format, and, most
 *     importantly, queries the database to prevent the creation of duplicate
 *     accounts with the same email, returning a 409 Conflict status if found.
 *   - On success, returns the newly created account object with a 201 status.
 *
 * - PUT /api/accounts?account_id=<...>:
 *   Updates an existing account. It allows for partial updates by dynamically building
 *   the update payload from the provided request body. It verifies that the
 *   account exists before attempting to apply the update.
 */
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

interface CreateAccountRequest {
  company_name: string
  contact_name: string  
  email: string
  website_url?: string
  company_description?: string
  industry?: string
}

interface UpdateAccountRequest extends Partial<CreateAccountRequest> {
  is_active?: boolean
}

// GET - List accounts with optional search
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const accountId = searchParams.get('account_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const supabase = getSupabaseClient()

    if (accountId) {
      // Get specific account with usage stats
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('*')
        .eq('account_id', accountId)
        .single()

      if (accountError) {
        if (accountError.code === 'PGRST116') {
          return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        }
        throw accountError
      }

      // Get usage stats
      const { data: runs, error: runsError } = await supabase
        .from('runs')
        .select('run_id, status, start_time, posts_analyzed_count, quotes_extracted_count')
        .eq('account_id', accountId)
        .order('start_time', { ascending: false })

      if (runsError) {
        throw runsError
      }

      const totalRuns = runs.length
      const totalPosts = runs.reduce((sum, run) => sum + (run.posts_analyzed_count || 0), 0)
      const totalQuotes = runs.reduce((sum, run) => sum + (run.quotes_extracted_count || 0), 0)

      return NextResponse.json({
        success: true,
        account: {
          ...account,
          usage_stats: {
            total_runs: totalRuns,
            total_posts_analyzed: totalPosts,
            total_quotes_extracted: totalQuotes,
            recent_runs: runs.slice(0, 5)
          }
        }
      })
    }

    // List accounts with optional search
    let query = supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: accounts, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      accounts,
      count: accounts.length,
      search_query: search || null
    })

  } catch (error) {
    console.error('Error fetching accounts:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch accounts',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// POST - Create new account
export async function POST(request: NextRequest) {
  try {
    const body: CreateAccountRequest = await request.json()
    
    // Validate required fields
    if (!body.company_name || !body.contact_name || !body.email) {
      return NextResponse.json(
        { error: 'Missing required fields: company_name, contact_name, email' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // Check for existing active account with same email
    const { data: existingAccount } = await supabase
      .from('accounts')
      .select('account_id')
      .eq('email', body.email)
      .eq('is_active', true)
      .single()

    if (existingAccount) {
      return NextResponse.json(
        { error: 'Account with this email already exists' },
        { status: 409 }
      )
    }

    // Create account
    const { data: account, error: createError } = await supabase
      .from('accounts')
      .insert({
        company_name: body.company_name.trim(),
        contact_name: body.contact_name.trim(),
        email: body.email.toLowerCase().trim(),
        website_url: body.website_url?.trim() || null,
        company_description: body.company_description?.trim() || null,
        industry: body.industry?.trim() || null
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating account:', createError)
      return NextResponse.json({ 
        error: 'Failed to create account',
        details: createError.message
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      account,
      message: 'Account created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Create account error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// PUT - Update account
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'account_id parameter is required' },
        { status: 400 }
      )
    }

    const body: UpdateAccountRequest = await request.json()
    
    // Remove undefined fields
    const updateData = Object.entries(body).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        if (typeof value === 'string') {
          acc[key] = value.trim()
        } else {
          acc[key] = value
        }
      }
      return acc
    }, {} as Record<string, any>)

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // Validate email if provided
    if (updateData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(updateData.email)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        )
      }
      updateData.email = updateData.email.toLowerCase()
    }

    const supabase = getSupabaseClient()

    // Check if account exists
    const { data: existingAccount, error: checkError } = await supabase
      .from('accounts')
      .select('account_id')
      .eq('account_id', accountId)
      .single()

    if (checkError || !existingAccount) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }

    // Update account
    const { data: updatedAccount, error: updateError } = await supabase
      .from('accounts')
      .update(updateData)
      .eq('account_id', accountId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating account:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update account',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      account: updatedAccount,
      message: 'Account updated successfully'
    })

  } catch (error) {
    console.error('Update account error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}