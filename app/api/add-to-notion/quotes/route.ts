/**
 * API route for exporting quotes from a specific pipeline run into a new,
 * dedicated Notion database. This serves as an automated way to create a
 * customer-facing deliverable from the results of a data analysis run.
 *
 * This endpoint leverages a suite of Notion helper functions that include robust
 * retry logic, batching, and delays to handle Notion API rate limits and
 * eventual consistency issues (e.g., 409 conflicts).
 *
 * - POST /api/add-to-notion/quotes:
 *   The primary endpoint for creating the Notion database.
 *   - Requires a `runId` to fetch the relevant quotes from Supabase and a
 *     `parentPageId` to specify where the new database should be created in Notion.
 *   - It first fetches all quotes for the run from the application's database.
 *   - It then creates a new database in Notion, titled for the specific company.
 *   - Finally, it iterates through the quotes and adds each one as a new page
 *     to the Notion database, using smart batching to avoid API errors.
 *   - Returns the URL and ID of the newly created Notion database.
 *
 * - GET /api/add-to-notion/quotes?runId=<...>:
 *   A simple read-only endpoint to preview the quotes available for a given run.
 *   - Fetches the quotes from Supabase and returns the total count, summary statistics,
 *     and a preview of the first 10 quotes. This is useful for verifying that a run
 *     has data before triggering the more intensive POST request.
 */
import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { createClient } from '@supabase/supabase-js';
import {
  createQuotesDatabase,
  addQuotesToNotion,
  fetchQuotesForRun,
  getQuoteStats
} from "../notionQuotesHelpers";

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Initialize Supabase client
function getSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

interface QuotesRequest {
  runId: string;
  parentPageId: string; // Where to create the quotes database
  companyName?: string;
  email?: string;
  accountId?: string;
}

export async function POST(request: Request) {
  try {
    const body: QuotesRequest = await request.json();
    const { runId, parentPageId, companyName, email, accountId } = body;

    // Validate required fields
    if (!runId) {
      return NextResponse.json(
        { error: "Run ID is required" },
        { status: 400 }
      );
    }

    if (!parentPageId) {
      return NextResponse.json(
        { error: "Parent Page ID is required (where to create the quotes database)" },
        { status: 400 }
      );
    }

    if (!process.env.NOTION_API_KEY) {
      return NextResponse.json(
        { error: "Notion API key not configured" },
        { status: 500 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database connection not configured" },
        { status: 500 }
      );
    }

    // Fetch quotes for this run
    console.log(`Fetching quotes for run ${runId}...`);
    const quotes = await fetchQuotesForRun(supabase, runId);
    
    if (quotes.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No quotes found for this run",
        stats: { total: 0 }
      });
    }

    // Determine company name
    let finalCompanyName = companyName || 'Unknown Company';
    
    // If we have accountId but no company name, fetch from accounts table
    if (accountId && !companyName) {
      const { data: account } = await supabase
        .from('accounts')
        .select('company_name')
        .eq('account_id', accountId)
        .single();
      
      if (account?.company_name) {
        finalCompanyName = account.company_name;
      }
    }

    // Create dedicated quotes database
    const quotesDbTitle = `${finalCompanyName} - Quotes Database`;
    console.log(`Creating quotes database: ${quotesDbTitle}`);
    const databaseId = await createQuotesDatabase(
      notion,
      parentPageId,
      quotesDbTitle
    );

    // Add quotes to the dedicated database
    console.log(`Adding ${quotes.length} quotes to Notion...`);
    const result = await addQuotesToNotion(
      notion,
      databaseId,
      quotes
    );

    // Get statistics
    const stats = getQuoteStats(quotes);

    return NextResponse.json({
      success: result.success,
      message: `Added ${result.count} of ${quotes.length} quotes to Notion`,
      databaseId,
      databaseUrl: `https://notion.so/${databaseId.replace(/-/g, '')}`,
      databaseTitle: quotesDbTitle,
      stats,
      errors: result.errors.length > 0 ? result.errors : undefined
    });

  } catch (error) {
    console.error("Error adding quotes to Notion:", error);
    return NextResponse.json(
      { 
        error: "Failed to add quotes to Notion",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check quotes for a run
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');

    if (!runId) {
      return NextResponse.json(
        { error: "Run ID is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database connection not configured" },
        { status: 500 }
      );
    }

    // Fetch quotes for this run
    const quotes = await fetchQuotesForRun(supabase, runId);
    const stats = getQuoteStats(quotes);

    return NextResponse.json({
      success: true,
      runId,
      quotes: quotes.slice(0, 10), // Return first 10 as preview
      stats,
      totalCount: quotes.length
    });

  } catch (error) {
    console.error("Error fetching quotes:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch quotes",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}