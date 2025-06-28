import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { createClient } from '@supabase/supabase-js';
import {
  generateParentPageTitle,
  extractCompanyName,
  extractContactName,
  extractReportType,
  createParentPageContent,
} from "./notionHelpers";
import {
  generateAITitleAsync,
  processQuotesAsync,
  createPlaceholderBlock,
  createLoadingBlock,
  updateHomepageWithIntro,
  findAndReplacePlaceholder,
  processFullReportContent,
} from "./notionAsyncHelpers";
// import { createBlocksFromMarkdown } from "./markdownParser"; // Will be used when placeholder replacement is implemented
import { fetchRunStatistics } from "./notionQuotesHelpers";
import { initializeStatus, trackAsyncOperation } from "./statusTracker";

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Updated delay constants for different operation types
const DELAYS = {
  NOTION_BASIC: 100,           // Basic operations
  NOTION_DATABASE: 1000,       // Database operations
  NOTION_HEAVY: 2000,         // Heavy operations (large content)
  DATABASE_CREATION: 3000,     // After database creation
  BATCH_PROCESSING: 500        // Between batch items
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

interface AccountData {
  account_id: string;
  company_name: string;
  contact_name: string;
  email: string;
  website_url?: string;
  company_description?: string;
  industry?: string;
}

interface ReportData {
  strategyReport?: string;
  comprehensiveReport?: string;
  subreddit?: string;
  email?: string;
  runId?: string;
  parentTemplateId?: string;
  strategyTemplateId?: string;
  comprehensiveTemplateId?: string;
  homepageTemplateId?: string;
  clientType?: 'demo' | 'existing' | 'prospect';
  accountId?: string;
  metadata?: {
    generatedAt?: string;
    analysisType?: string;
    [key: string]: any;
  };
}

// Helper function to get the banner image URL
function getBannerImageUrl(): string {
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
    : process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : 'https://reddit-opportunity-engine-production.up.railway.app';
  
  return `${baseUrl}/dodo-digital-audience-research-banner.png`;
}

// Fetch account data
async function getAccountData(accountId: string): Promise<AccountData | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('Supabase client not available');
      return null;
    }

    const { data: account, error } = await supabase
      .from('accounts')
      .select('account_id, company_name, contact_name, email, website_url, company_description, industry')
      .eq('account_id', accountId)
      .single();

    if (error || !account) {
      console.warn(`Account ${accountId} not found`);
      return null;
    }

    return account;
  } catch (error) {
    console.error('Error fetching account data:', error);
    return null;
  }
}

// Fetch account data from runId
async function getAccountDataFromRun(runId: string): Promise<AccountData | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return null;
    }

    // First get the run to find the account_id
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select('account_id')
      .eq('run_id', runId)
      .single();

    if (runError || !run || !run.account_id) {
      console.warn(`Run ${runId} not found or no account associated`);
      return null;
    }

    // Then get the account data
    return await getAccountData(run.account_id);
  } catch (error) {
    console.error('Error fetching account data from run:', error);
    return null;
  }
}

// Quick report page creation (minimal processing)
async function createReportPageQuick({
  parentPageId,
  title,
  content,
  reportType,
}: {
  parentPageId: string;
  title: string;
  content: string;
  reportType: 'strategy' | 'comprehensive';
}) {
  // Create page with just title and basic content
  const page = await notion.pages.create({
    parent: { page_id: parentPageId },
    properties: {
      title: {
        title: [{
          text: { content: title }
        }]
      }
    },
    icon: {
      type: "emoji",
      emoji: reportType === 'strategy' ? "🎯" : "📊"
    }
  });

  // Add content as simple paragraphs (no markdown parsing for speed)
  const chunks = content.match(/.{1,1900}/g) || [content];
  const blocks = chunks.slice(0, 10).map(chunk => ({
    type: "paragraph" as const,
    paragraph: {
      rich_text: [{
        text: { content: chunk }
      }]
    }
  }));

  if (chunks.length > 10) {
    blocks.push({
      type: "paragraph" as const,
      paragraph: {
        rich_text: [{
          text: { 
            content: "... (content truncated for quick loading - full content will be processed shortly)"
          },
          annotations: { 
            italic: true, 
            color: "gray" as const,
            bold: false,
            strikethrough: false,
            underline: false,
            code: false
          }
        } as any]
      }
    });
  }

  await notion.blocks.children.append({
    block_id: page.id,
    children: blocks
  });

  return page;
}

export async function POST(request: Request) {
  const startTime = Date.now();
  
  try {
    const body: ReportData = await request.json();
    console.log(`[QUICK RESPONSE] Starting processing for ${body.email || 'unknown'}`);
    
    const { 
      strategyReport, 
      comprehensiveReport, 
      email, 
      runId, 
      accountId,
      metadata 
    } = body;

    // Validate required fields
    if (!strategyReport && !comprehensiveReport) {
      return NextResponse.json(
        { error: "At least one report is required" },
        { status: 400 }
      );
    }

    if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
      return NextResponse.json(
        { error: "Notion configuration missing" },
        { status: 500 }
      );
    }

    // --- PHASE 1: Quick Response (Target: < 10 seconds) ---
    
    // 1. Get basic data (quick operations only)
    const [accountData, runStats] = await Promise.all([
      accountId ? getAccountData(accountId) : 
        runId ? getAccountDataFromRun(runId) : 
        Promise.resolve(null),
      runId && getSupabaseClient() ? 
        fetchRunStatistics(getSupabaseClient()!, runId).catch(() => ({ postsCount: 0, quotesCount: 0 })) : 
        Promise.resolve({ postsCount: 0, quotesCount: 0 })
    ]);

    const companyName = accountData?.company_name || extractCompanyName(email);
    const contactName = accountData?.contact_name || extractContactName(email);
    const reportType = extractReportType(metadata);

    // 2. Create parent page in database (quick)
    const rawParentPageTitle = generateParentPageTitle({ 
      email: accountData?.email || email, 
      metadata, 
      reportType, 
      date: new Date(),
      accountData 
    });

    // Sanitize and validate inputs
    const parentPageTitle = rawParentPageTitle ? 
      rawParentPageTitle.substring(0, 100).replace(/[^\w\s\-&.,()]/g, '') : 
      'Untitled Report';
    
    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    
    console.log('Creating parent page with:', {
      parentPageTitle,
      reportType: reportType || '',
      email: email || 'none',
      titleLength: parentPageTitle.length
    });

    // Create parent page in database (restore exact working structure)
    const parentPage = await notionCreateWithRetry(
      () => notion.pages.create({
        parent: { database_id: process.env.NOTION_DATABASE_ID! },
        properties: {
          Company: {
            title: [{ text: { content: parentPageTitle } }]
          },
          "Report Type": {
            rich_text: [{ text: { content: reportType || '' } }]
          },
          "Contact Email": {
            email: email || ''  // CRITICAL: Always send, even empty (matches working system)
          }
        }
      }),
      'Parent page creation'
    );

    // Add delay after parent page creation
    await delay(DELAYS.NOTION_BASIC);

    // 3. Create branded homepage (quick, with placeholders)
    const brandedHomepage = await notionCreateWithRetry(
      () => notion.pages.create({
        parent: { page_id: parentPage.id },
        properties: {
          title: {
            title: [{
              text: { content: `${companyName} Market Research Analysis` } // Temporary title
            }]
          }
        },
        icon: { type: "emoji", emoji: "📊" },
        cover: {
          type: "external",
          external: { url: getBannerImageUrl() }
        }
      }),
      'Branded homepage creation'
    );

    const homepageUrl = `https://notion.so/${brandedHomepage.id.replace(/-/g, '')}`;

    // Add delay after homepage creation
    await delay(DELAYS.NOTION_BASIC);

    // 4. Update parent page with homepage link
    await notionCreateWithRetry(
      () => notion.blocks.children.append({
        block_id: parentPage.id,
        children: createParentPageContent({ homepageUrl })
      }),
      'Parent page homepage link'
    );

    // Add delay after parent page update
    await delay(DELAYS.NOTION_BASIC);

    // 5. Create report pages sequentially (prevent timing conflicts)
    const results = {
      parentPageId: parentPage.id,
      parentPageUrl: `https://notion.so/${parentPage.id.replace(/-/g, '')}`,
      brandedHomepageId: brandedHomepage.id,
      brandedHomepageUrl: homepageUrl,
      childPages: [] as Array<{ id: string; url: string; title: string }>,
    };

    // Create report pages one at a time with delays
    if (strategyReport) {
      const strategyPage = await createReportPageQuick({
        parentPageId: brandedHomepage.id,
        title: `${companyName} - Strategy Report`,
        content: strategyReport,
        reportType: 'strategy'
      });
      results.childPages.push({
        id: strategyPage.id,
        url: `https://notion.so/${strategyPage.id.replace(/-/g, '')}`,
        title: 'Strategy Report'
      });
      await delay(DELAYS.NOTION_BASIC);
    }

    if (comprehensiveReport) {
      const comprehensivePage = await createReportPageQuick({
        parentPageId: brandedHomepage.id,
        title: `${companyName} - Comprehensive Analysis`,
        content: comprehensiveReport,
        reportType: 'comprehensive'
      });
      results.childPages.push({
        id: comprehensivePage.id,
        url: `https://notion.so/${comprehensivePage.id.replace(/-/g, '')}`,
        title: 'Comprehensive Analysis'
      });
      await delay(DELAYS.NOTION_BASIC);
    }

    // 6. Add basic homepage content with placeholders
    const homepageBlocks = [
      {
        type: "heading_1" as const,
        heading_1: { 
          rich_text: [{ 
            text: { content: `${companyName} Market Research Analysis` } 
          }] 
        }
      },
      {
        type: "heading_2" as const,
        heading_2: { 
          rich_text: [{ 
            text: { content: "Research Overview" } 
          }] 
        }
      },
      {
        type: "paragraph" as const,
        paragraph: { 
          rich_text: [{ 
            text: { content: `We conducted a comprehensive analysis of Reddit discussions to understand market opportunities and user needs relevant to ${companyName}. This research provides actionable insights from real user conversations and feedback.` } 
          }] 
        }
      },
      { type: "divider" as const, divider: {} },
      // Stats callout if available
      ...(runStats.postsCount > 0 ? [{
        type: "callout" as const,
        callout: {
          icon: { type: "emoji" as const, emoji: "📈" },
          rich_text: [{
            text: { 
              content: `Analysis Summary: We reviewed ${runStats.postsCount} posts and extracted ${runStats.quotesCount} valuable quotes for this research.` 
            }
          }]
        }
      }] : []),
      // Placeholder for AI intro
      createLoadingBlock("Generating personalized introduction..."),
      // Report links
      ...results.childPages.map(page => ({
        type: "paragraph" as const,
        paragraph: { 
          rich_text: [{ 
            text: { 
              content: `View ${page.title}`, 
              link: { url: page.url } 
            } 
          }] 
        }
      })),
      // Placeholder for quotes
      ...(runId ? [createLoadingBlock("Processing quotes database...")] : [])
    ];

    await notion.blocks.children.append({
      block_id: brandedHomepage.id,
      children: homepageBlocks
    });

    // Add delay after homepage blocks
    await delay(DELAYS.NOTION_BASIC);

    const responseTime = Date.now() - startTime;
    console.log(`[QUICK RESPONSE] Initial setup complete in ${responseTime}ms`);

    // Initialize status tracking if runId is provided
    if (runId) {
      initializeStatus(runId);
    }

    // --- PHASE 2: Async Processing (Fire and forget) ---
    
    // Process async tasks in background
    Promise.all([
      // Generate AI title and update homepage
      runId ? 
        trackAsyncOperation(runId, 'aiTitle', async () => {
          const smartTitle = await generateAITitleAsync({ strategyReport, comprehensiveReport });
          await notion.pages.update({
            page_id: brandedHomepage.id,
            properties: {
              title: {
                title: [{ text: { content: smartTitle } }]
              }
            }
          });
          console.log(`[ASYNC] Updated page title to: ${smartTitle}`);
          return smartTitle;
        }) : 
        generateAITitleAsync({ strategyReport, comprehensiveReport })
          .then(async (smartTitle) => {
            await notion.pages.update({
              page_id: brandedHomepage.id,
              properties: {
                title: {
                  title: [{ text: { content: smartTitle } }]
                }
              }
            });
            console.log(`[ASYNC] Updated page title to: ${smartTitle}`);
          })
          .catch(err => console.error('[ASYNC] Failed to update title:', err)),

      // Generate and add homepage intro
      runId ?
        trackAsyncOperation(runId, 'homepageIntro', async () => {
          const { generateResearchSummaryIntro } = await import('./notionAsyncHelpers');
          const intro = await generateResearchSummaryIntro({
            companyName,
            runStats,
            timeframe: 'Recent discussions',
            accountData: accountData || undefined
          });
          
          // Apply the intro to the homepage by replacing the placeholder
          const success = await updateHomepageWithIntro(notion, brandedHomepage.id, intro);
          console.log(`[ASYNC] Generated and applied research summary intro (${intro.length} chars), success: ${success}`);
          return intro;
        }) :
        (async () => {
          const { generateResearchSummaryIntro } = await import('./notionAsyncHelpers');
          return await generateResearchSummaryIntro({
            companyName,
            runStats,
            timeframe: 'Recent discussions',
            accountData: accountData || undefined
          });
        })()
          .then(async (intro) => {
            // Apply the intro to the homepage by replacing the placeholder
            const success = await updateHomepageWithIntro(notion, brandedHomepage.id, intro);
            console.log(`[ASYNC] Generated and applied homepage intro (${intro.length} chars), success: ${success}`);
          })
          .catch(err => console.error('[ASYNC] Failed to generate intro:', err)),

      // Process quotes if runId provided
      runId && getSupabaseClient() ? 
        trackAsyncOperation(runId, 'quotes', async () => {
          const result = await processQuotesAsync({
            notion,
            brandedHomepageId: brandedHomepage.id,
            runId,
            accountData,
            companyName,
            runStats,
            supabase: getSupabaseClient()!
          });
          console.log(`[ASYNC] Quotes processed:`, result);
          return result;
        })
        : Promise.resolve(),

      // Process full report content in background (without status tracking for simplicity)
      ...results.childPages.map(page => 
        (async () => {
          const reportContent = page.title.includes('Strategy') ? strategyReport : comprehensiveReport;
          const reportType = page.title.includes('Strategy') ? 'strategy' : 'comprehensive';
          
          if (reportContent) {
            const success = await processFullReportContent(
              notion,
              page.id,
              reportContent,
              reportType
            );
            console.log(`[ASYNC] Full ${reportType} content processed, success: ${success}`);
            return success;
          }
          return false;
        })()
      )
    ]);

    // Return success immediately
    return NextResponse.json({
      success: true,
      message: "Reports successfully added to Notion",
      data: {
        ...results,
        shareableUrl: results.brandedHomepageUrl,
        note: "Initial setup complete. AI content and quotes are being processed in the background.",
        processingTime: `${responseTime}ms`,
        ...(runId ? { statusUrl: `/api/add-to-notion/status?runId=${runId}` } : {})
      }
    });

  } catch (error) {
    console.error("Error in quick response:", error);
    return NextResponse.json(
      { 
        error: "Failed to add reports to Notion",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}