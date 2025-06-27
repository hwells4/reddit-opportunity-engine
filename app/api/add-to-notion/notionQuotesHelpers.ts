// Notion helper functions for managing quotes database and tables
import { Client } from "@notionhq/client";

// Updated delay constants for different operation types
const DELAYS = {
  NOTION_BASIC: 100,           // Basic operations
  NOTION_DATABASE: 1000,       // Database operations
  NOTION_HEAVY: 2000,         // Heavy operations (large content)
  DATABASE_CREATION: 3000,     // After database creation
  BATCH_PROCESSING: 150,       // Between batch items (optimized from 500ms)
  MICRO_BATCH: 50,            // For small batches
  ERROR_RECOVERY: 1000        // Only when retrying errors
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Verify that a database is ready for operations after creation
 * Database creation is internally asynchronous in Notion
 */
async function verifyDatabaseReady(notion: Client, databaseId: string, maxAttempts = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await notion.databases.retrieve({ database_id: databaseId });
      console.log('Database verified ready');
      return;
    } catch (error: any) {
      if (attempt === maxAttempts) {
        console.error(`Database not ready after ${maxAttempts} attempts`, error);
        throw error;
      }
      console.log(`Database not ready, attempt ${attempt}/${maxAttempts}, waiting...`);
      await delay(DELAYS.NOTION_DATABASE);
    }
  }
}

// Enhanced retry wrapper with operation-specific delays
const notionCreateWithRetry = async <T>(
  createFunction: () => Promise<T>, 
  operation: string,
  maxRetries = 3
): Promise<T> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await createFunction();
    } catch (error: any) {
      if (error.status === 409 && attempt < maxRetries) {
        // Enhanced backoff for different operation types
        let retryDelay = attempt * 1000; // Base: 1s, 2s, 3s
        
        if (operation.includes('database')) {
          retryDelay = attempt * 2000; // Database ops: 2s, 4s, 6s
        }
        if (operation.includes('Quote creation')) {
          retryDelay = attempt * 1500; // Quote ops: 1.5s, 3s, 4.5s
        }
        
        console.warn(`[RETRY ${attempt}/${maxRetries}] 409 conflict in ${operation}, retrying in ${retryDelay}ms...`);
        await delay(retryDelay);
        continue;
      }
      // Re-throw if not 409 or max retries exceeded
      console.error(`[NOTION ERROR] ${operation} failed:`, {
        status: error.status,
        message: error.message,
        attempt,
        maxRetries
      });
      throw error;
    }
  }
  throw new Error(`Retry logic error: should not reach here`);
};

/**
 * Create a dedicated quotes database for a specific run
 * Each run gets its own database for clean client presentation
 */
export async function createQuotesDatabase(
  notion: Client, 
  parentPageId: string,
  title: string
): Promise<string> {
  try {
    console.log(`Creating quotes database: ${title}`);
    const newDatabase = await notionCreateWithRetry(
      () => notion.databases.create({
      parent: { page_id: parentPageId },
      title: [
        {
          type: "text",
          text: { content: title }
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
        "Justification": {
          rich_text: {}
        },
        "Extraction Method": {
          select: {
            options: [
              { name: "structured_xml", color: "green" },
              { name: "generic_extraction", color: "blue" },
              { name: "text_in_quotes", color: "yellow" },
              { name: "sentence_extraction", color: "orange" },
              { name: "emergency_fallback", color: "red" },
              { name: "unknown", color: "gray" }
            ]
          }
        },
        "Question Aspects": {
          multi_select: {
            options: [
              { name: "pricing", color: "green" },
              { name: "features", color: "blue" },
              { name: "user_experience", color: "purple" },
              { name: "competition", color: "orange" },
              { name: "pain_points", color: "red" },
              { name: "user_needs", color: "pink" },
              { name: "performance", color: "yellow" },
              { name: "integration", color: "gray" },
              { name: "support", color: "brown" },
              { name: "workflow", color: "default" },
              { name: "general_relevance", color: "gray" }
            ]
          }
        },
        "Date Added": {
          date: {}
        },
        "Post ID": {
          rich_text: {}
        }
      }
      }),
      'Quotes database creation'
    );

    console.log('Created quotes database:', newDatabase.id);
    
    // CRITICAL: Wait for database to be fully ready
    console.log('Database created, waiting for readiness...');
    await delay(DELAYS.DATABASE_CREATION); // 3 second mandatory delay
    
    // Verify database is accessible
    await verifyDatabaseReady(notion, newDatabase.id);
    
    return newDatabase.id;
  } catch (error) {
    console.error('Error creating quotes database:', error);
    throw error;
  }
}

/**
 * Format a quote from our database to Notion properties (simplified for individual databases)
 */
export function formatQuoteForNotion(quote: any): any {
  // Extract Reddit URL from the post if available
  const redditUrl = quote.post?.url || (quote.post?.subreddit ? `https://reddit.com/r/${quote.post.subreddit}` : null);
  
  const properties: any = {
    "Quote": {
      title: [
        {
          text: { content: quote.text || "No quote text" }
        }
      ]
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
    "Relevance Score": {
      number: quote.relevance_score || 0
    },
    "Justification": {
      rich_text: [
        {
          text: { content: quote.relevance_justification || "No justification provided" }
        }
      ]
    },
    "Extraction Method": {
      select: { name: quote.processing_method || "unknown" }
    },
    "Question Aspects": {
      multi_select: (quote.question_aspects || []).map((aspect: string) => ({ name: aspect }))
    },
    "Date Added": {
      date: { start: quote.inserted_at || new Date().toISOString().split('T')[0] }
    }
  };

  // Only add Reddit Link if we have a valid URL
  if (redditUrl) {
    properties["Reddit Link"] = {
      url: redditUrl
    };
  }

  // Only add Post ID if we have one
  if (quote.post_id) {
    properties["Post ID"] = {
      rich_text: [{ text: { content: quote.post_id } }]
    };
  }

  return properties;
}

/**
 * Add quotes to the individual run's Notion database
 * Uses smart batching based on quote count for optimal performance
 */
export async function addQuotesToNotion(
  notion: Client,
  databaseId: string,
  quotes: any[]
): Promise<{ success: boolean; count: number; errors: any[] }> {
  const results = {
    success: true,
    count: 0,
    errors: [] as any[]
  };

  const totalQuotes = quotes.length;
  console.log(`Processing ${totalQuotes} quotes with smart batching...`);

  // Smart batching strategy based on quote count
  let batchSize: number;
  let batchDelay: number;
  
  if (totalQuotes <= 50) {
    batchSize = 5; 
    batchDelay = DELAYS.MICRO_BATCH;      // Small: 5 at a time, 50ms delay
    console.log('Using small batch strategy: 5 quotes per batch, 50ms delay');
  } else if (totalQuotes <= 200) {
    batchSize = 3; 
    batchDelay = DELAYS.BATCH_PROCESSING; // Medium: 3 at a time, 150ms delay
    console.log('Using medium batch strategy: 3 quotes per batch, 150ms delay');
  } else {
    batchSize = 2; 
    batchDelay = 200;                     // Large: 2 at a time, 200ms delay
    console.log('Using large batch strategy: 2 quotes per batch, 200ms delay');
  }
  
  // Process in micro-batches for better throughput
  for (let i = 0; i < quotes.length; i += batchSize) {
    const batch = quotes.slice(i, i + batchSize);
    
    // Process batch in parallel (safe for small batches)
    const batchPromises = batch.map(async (quote) => {
      try {
        const properties = formatQuoteForNotion(quote);
        
        await notionCreateWithRetry(
          () => notion.pages.create({
            parent: { database_id: databaseId },
            properties
          }),
          `Quote creation for ${quote.quote_id || 'unknown'}`
        );
        
        results.count++;
        return { success: true, quote_id: quote.quote_id };
      } catch (error: any) {
        console.error(`Failed to add quote ${quote.quote_id}:`, error);
        results.errors.push({
          quote_id: quote.quote_id,
          error: error.message
        });
        results.success = false;
        return { success: false, quote_id: quote.quote_id };
      }
    });
    
    // Wait for batch to complete
    await Promise.all(batchPromises);
    
    // Smart delay based on batch size (only between batches, not after last)
    if (i + batchSize < quotes.length) {
      await delay(batchDelay);
    }
    
    // Progress logging for large batches
    if (results.count % 50 === 0 || i + batchSize >= quotes.length) {
      console.log(`Processed ${results.count}/${quotes.length} quotes`);
    }
  }
  
  const performance = totalQuotes > 0 ? (results.count / totalQuotes * 100).toFixed(1) : '0';
  console.log(`Quote processing complete: ${results.count}/${quotes.length} successful (${performance}%)`);
  return results;
}

/**
 * Create a simple link block to the dedicated quotes database
 * No filtering needed since each database is already for one specific run
 */
export function createQuotesLinkBlock(
  databaseUrl: string, 
  postsCount: number, 
  quotesCount: number
): any[] {
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
              content: `We analyzed ${postsCount} posts and extracted ${quotesCount} valuable quotes from this research. ` 
            }
          },
          {
            text: { 
              content: "View the complete quotes database",
              link: { url: databaseUrl }
            }
          },
          {
            text: { 
              content: " to explore all insights, filter by category or sentiment, and analyze patterns." 
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
              content: "💡 Use the database views to group quotes by Category (user needs, pain points, etc.) or Sentiment (positive, frustrated, etc.) for deeper analysis." 
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
 * Fetch post count for a specific run from Supabase
 */
export async function fetchPostCountForRun(supabase: any, runId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', runId);

    if (error) {
      console.error('Error fetching post count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Failed to fetch post count for run:', error);
    return 0;
  }
}

/**
 * Fetch run statistics (posts and quotes count)
 */
export async function fetchRunStatistics(supabase: any, runId: string): Promise<{
  postsCount: number;
  quotesCount: number;
}> {
  try {
    // Fetch posts count
    const { count: postsCount, error: postsError } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', runId);

    if (postsError) {
      console.error('Error fetching posts count:', postsError);
    }

    // Fetch quotes count
    const { count: quotesCount, error: quotesError } = await supabase
      .from('quotes')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', runId);

    if (quotesError) {
      console.error('Error fetching quotes count:', quotesError);
    }

    return {
      postsCount: postsCount || 0,
      quotesCount: quotesCount || 0
    };
  } catch (error) {
    console.error('Failed to fetch run statistics:', error);
    return {
      postsCount: 0,
      quotesCount: 0
    };
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