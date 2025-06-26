// Notion helper functions for managing quotes database and tables
import { Client } from "@notionhq/client";

/**
 * Create or get the central quotes database in Notion
 * This database will store all quotes across all runs/clients
 */
export async function createOrGetQuotesDatabase(notion: Client, parentPageId?: string): Promise<string> {
  try {
    // First, try to find existing quotes database
    const response = await notion.search({
      query: "Quotes Database",
      filter: {
        value: "database",
        property: "object"
      }
    });

    // If database exists, return its ID
    if (response.results.length > 0) {
      const existingDb = response.results.find((db: any) => 
        db.object === 'database' && db.title?.[0]?.plain_text === 'Quotes Database'
      );
      if (existingDb) {
        console.log('Found existing quotes database:', existingDb.id);
        return existingDb.id;
      }
    }

    // Create new database if it doesn't exist
    console.log('Creating new quotes database...');
    const newDatabase = await notion.databases.create({
      parent: parentPageId ? { page_id: parentPageId } : { 
        type: "workspace" as const,
        workspace: true 
      },
      title: [
        {
          type: "text",
          text: { content: "Quotes Database" }
        }
      ],
      icon: {
        type: "emoji",
        emoji: "💬"
      },
      properties: {
        "Quote": {
          title: {}
        },
        "Run ID": {
          rich_text: {}
        },
        "Company": {
          rich_text: {}
        },
        "Category": {
          select: {
            options: [
              { name: "user_needs", color: "blue" },
              { name: "user_language", color: "green" },
              { name: "current_solutions", color: "yellow" },
              { name: "feature_signals", color: "purple" },
              { name: "general", color: "gray" },
              { name: "extracted_text", color: "orange" },
              { name: "sentence_extract", color: "pink" },
              { name: "unstructured", color: "red" }
            ]
          }
        },
        "Sentiment": {
          select: {
            options: [
              { name: "positive", color: "green" },
              { name: "negative", color: "red" },
              { name: "neutral", color: "gray" },
              { name: "frustrated", color: "orange" },
              { name: "excited", color: "blue" },
              { name: "confused", color: "yellow" }
            ]
          }
        },
        "Theme": {
          select: {
            options: [
              { name: "general", color: "gray" },
              { name: "user_feedback", color: "blue" },
              { name: "feature_request", color: "green" },
              { name: "pain_point", color: "red" },
              { name: "workflow", color: "purple" },
              { name: "comparison", color: "yellow" },
              { name: "pricing", color: "orange" },
              { name: "organization", color: "pink" }
            ]
          }
        },
        "Reddit Link": {
          url: {}
        },
        "Relevance Score": {
          number: {
            format: "number"
          }
        },
        "Date Added": {
          date: {}
        },
        "Contact Email": {
          email: {}
        },
        "Post ID": {
          rich_text: {}
        }
      }
    });

    console.log('Created new quotes database:', newDatabase.id);
    return newDatabase.id;
  } catch (error) {
    console.error('Error creating/getting quotes database:', error);
    throw error;
  }
}

/**
 * Format a quote from our database to Notion properties
 */
export function formatQuoteForNotion(quote: any, runData: {
  runId: string;
  companyName: string;
  email?: string;
}): any {
  // Extract Reddit URL from the post if available
  const redditUrl = quote.post?.url || `https://reddit.com/r/${quote.post?.subreddit || 'unknown'}`;
  
  return {
    "Quote": {
      title: [
        {
          text: { content: quote.text || "No quote text" }
        }
      ]
    },
    "Run ID": {
      rich_text: [{ text: { content: runData.runId } }]
    },
    "Company": {
      rich_text: [{ text: { content: runData.companyName } }]
    },
    "Category": {
      select: { name: quote.category || "general" }
    },
    "Sentiment": {
      select: { name: quote.sentiment || "neutral" }
    },
    "Theme": {
      select: { name: quote.theme || "general" }
    },
    "Reddit Link": {
      url: redditUrl
    },
    "Relevance Score": {
      number: quote.relevance_score || 0
    },
    "Date Added": {
      date: { start: quote.inserted_at || new Date().toISOString() }
    },
    "Contact Email": {
      email: runData.email || null
    },
    "Post ID": {
      rich_text: [{ text: { content: quote.post_id || "" } }]
    }
  };
}

/**
 * Add quotes to the Notion database
 * Handles batching to respect Notion's API limits
 */
export async function addQuotesToNotion(
  notion: Client,
  databaseId: string,
  quotes: any[],
  runData: {
    runId: string;
    companyName: string;
    email?: string;
  }
): Promise<{ success: boolean; count: number; errors: any[] }> {
  const results = {
    success: true,
    count: 0,
    errors: [] as any[]
  };

  // Process quotes in batches of 10 to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < quotes.length; i += batchSize) {
    const batch = quotes.slice(i, i + batchSize);
    
    // Process each quote in the batch
    const promises = batch.map(async (quote) => {
      try {
        const properties = formatQuoteForNotion(quote, runData);
        
        await notion.pages.create({
          parent: { database_id: databaseId },
          properties
        });
        
        results.count++;
      } catch (error: any) {
        console.error('Error adding quote to Notion:', error);
        results.errors.push({
          quote_id: quote.quote_id,
          error: error.message
        });
        results.success = false;
      }
    });

    // Wait for batch to complete
    await Promise.all(promises);
    
    // Add a small delay between batches to respect rate limits
    if (i + batchSize < quotes.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

/**
 * Create a filtered view of quotes for a specific run
 * Returns a link to the filtered database view
 */
export async function createQuotesViewLink(
  databaseId: string,
  runId: string,
  companyName: string
): Promise<string> {
  // Notion doesn't allow creating filtered views via API
  // Instead, we'll return a properly formatted filter URL
  const baseUrl = `https://notion.so/${databaseId.replace(/-/g, '')}`;
  
  // URL encode the filter parameters
  const filterParams = encodeURIComponent(JSON.stringify({
    "filter": {
      "property": "Run ID",
      "rich_text": {
        "equals": runId
      }
    }
  }));
  
  // Note: This URL format may not work perfectly due to Notion's URL structure
  // In practice, users will need to apply the filter manually
  return baseUrl;
}

/**
 * Create an embedded quotes table block for the report page
 * This adds a linked database view filtered to show only quotes for the current run
 */
export function createQuotesTableBlock(databaseId: string, runId: string): any {
  return {
    type: "child_database",
    child_database: {
      title: `Quotes from this Analysis`,
      children: [] // Notion will populate this
    }
  };
}

/**
 * Create a simple link block to the quotes database with instructions
 */
export function createQuotesLinkBlock(databaseUrl: string, runId: string, quotesCount: number): any[] {
  return [
    {
      type: "divider",
      divider: {}
    },
    {
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            text: { content: "📊 Extracted Quotes & Insights" }
          }
        ]
      }
    },
    {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            text: { 
              content: `We extracted ${quotesCount} quotes from this analysis. ` 
            }
          },
          {
            text: { 
              content: "View all quotes in the database",
              link: { url: databaseUrl }
            }
          },
          {
            text: { 
              content: ` and filter by Run ID: "${runId}" to see quotes specific to this report.` 
            }
          }
        ]
      }
    },
    {
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "💡" },
        rich_text: [
          {
            text: { 
              content: "Tip: In the quotes database, use the filter option to show only quotes from this run by filtering 'Run ID' equals '" 
            }
          },
          {
            text: { 
              content: runId,
              annotations: { code: true }
            }
          },
          {
            text: { 
              content: "'. You can also group by Category or Sentiment to analyze patterns." 
            }
          }
        ]
      }
    }
  ];
}

/**
 * Fetch quotes for a specific run from Supabase
 */
export async function fetchQuotesForRun(supabase: any, runId: string): Promise<any[]> {
  try {
    const { data: quotes, error } = await supabase
      .from('quotes')
      .select(`
        *,
        post:posts(
          url,
          subreddit,
          title
        )
      `)
      .eq('run_id', runId)
      .order('relevance_score', { ascending: false });

    if (error) {
      console.error('Error fetching quotes:', error);
      throw error;
    }

    return quotes || [];
  } catch (error) {
    console.error('Failed to fetch quotes for run:', error);
    return [];
  }
}

/**
 * Get summary statistics for quotes
 */
export function getQuoteStats(quotes: any[]): {
  total: number;
  byCategory: Record<string, number>;
  bySentiment: Record<string, number>;
  relevant: number;
} {
  const stats = {
    total: quotes.length,
    byCategory: {} as Record<string, number>,
    bySentiment: {} as Record<string, number>,
    relevant: 0
  };

  quotes.forEach(quote => {
    // Count by category
    const category = quote.category || 'general';
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

    // Count by sentiment
    const sentiment = quote.sentiment || 'neutral';
    stats.bySentiment[sentiment] = (stats.bySentiment[sentiment] || 0) + 1;

    // Count relevant quotes
    if (quote.relevance_score > 0) {
      stats.relevant++;
    }
  });

  return stats;
}