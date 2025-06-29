/**
 * API route specifically designed to power a search feature for "accounts".
 * As suggested by the `formatAccountForCLI` helper function, this endpoint is
 * likely optimized for an internal tool or Command Line Interface (CLI) where a
 * user needs to quickly find and select an account from the database.
 *
 * - GET /api/accounts/search?q=<...>&limit=<...>:
 *   Searches for active accounts in the Supabase `accounts` table.
 *
 *   The endpoint has two behaviors based on the `q` parameter:
 *   1.  **No Query**: If the `q` parameter is empty or not provided, it returns a
 *       list of the most recently created accounts. This provides a sensible default
 *       for a search interface.
 *   2.  **With Query**: If the `q` parameter is provided, it performs a case-insensitive
 *       search across the `company_name`, `contact_name`, and `email` fields,
 *       offering a flexible way to find a specific account.
 *
 *   All results are formatted into a user-friendly structure, including a
 *   combined `display_name`, before being returned.
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

// GET - Search accounts optimized for CLI selection
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const limit = parseInt(searchParams.get('limit') || '10')

    const supabase = getSupabaseClient()

    if (!query.trim()) {
      // If no search query, return recent accounts
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select('account_id, company_name, contact_name, email, website_url, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw error
      }

      return NextResponse.json({
        success: true,
        accounts: accounts.map(formatAccountForCLI),
        search_type: 'recent'
      })
    }

    // Search accounts by company name, contact name, or email
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('account_id, company_name, contact_name, email, website_url, created_at')
      .eq('is_active', true)
      .or(`company_name.ilike.%${query}%,contact_name.ilike.%${query}%,email.ilike.%${query}%`)
      .order('company_name', { ascending: true })
      .limit(limit)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      accounts: accounts.map(formatAccountForCLI),
      search_query: query,
      search_type: 'filtered',
      count: accounts.length
    })

  } catch (error) {
    console.error('Error searching accounts:', error)
    return NextResponse.json(
      { 
        error: 'Failed to search accounts',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Format account data for CLI display
function formatAccountForCLI(account: any) {
  return {
    account_id: account.account_id,
    display_name: `${account.company_name} (${account.contact_name})`,
    company_name: account.company_name,
    contact_name: account.contact_name,
    email: account.email,
    website_url: account.website_url,
    created_date: new Date(account.created_at).toLocaleDateString()
  }
}