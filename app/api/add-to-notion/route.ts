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
  generateHomepageIntroAsync,
  processQuotesAsync,
  createPlaceholderBlock,
  createLoadingBlock,
} from "./notionAsyncHelpers";
// import { createBlocksFromMarkdown } from "./markdownParser"; // Will be used when placeholder replacement is implemented
import { fetchRunStatistics } from "./notionQuotesHelpers";
import { initializeStatus, trackAsyncOperation } from "./statusTracker";

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

    // Create parent page in database
    let parentPage;
    try {
      parentPage = await notion.pages.create({
        parent: { database_id: process.env.NOTION_DATABASE_ID! },
        properties: {
          Company: {
            title: [{ text: { content: parentPageTitle } }]
          },
          "Report Type": {
            rich_text: [{ text: { content: (reportType || '').substring(0, 200) } }]
          },
          ...(email && isValidEmail(email) && {
            "Contact Email": {
              email: email
            }
          })
        }
      });
    } catch (error: any) {
      console.error('Notion parent page creation failed:', error);
      console.error('Properties sent:', {
        parentPageTitle,
        reportType: reportType || '',
        email: email || 'none',
        hasValidEmail: email ? isValidEmail(email) : false
      });
      throw new Error(`Failed to create parent page: ${error.message}`);
    }

    // 3. Create branded homepage (quick, with placeholders)
    const brandedHomepage = await notion.pages.create({
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
    });

    const homepageUrl = `https://notion.so/${brandedHomepage.id.replace(/-/g, '')}`;

    // 4. Update parent page with homepage link
    await notion.blocks.children.append({
      block_id: parentPage.id,
      children: createParentPageContent({ homepageUrl })
    });

    // 5. Create report pages (quick version)
    const reportPromises = [];
    const results = {
      parentPageId: parentPage.id,
      parentPageUrl: `https://notion.so/${parentPage.id.replace(/-/g, '')}`,
      brandedHomepageId: brandedHomepage.id,
      brandedHomepageUrl: homepageUrl,
      childPages: [] as Array<{ id: string; url: string; title: string }>,
    };

    if (strategyReport) {
      reportPromises.push(
        createReportPageQuick({
          parentPageId: brandedHomepage.id,
          title: `${companyName} - Strategy Report`,
          content: strategyReport,
          reportType: 'strategy'
        }).then(page => ({
          id: page.id,
          url: `https://notion.so/${page.id.replace(/-/g, '')}`,
          title: 'Strategy Report'
        }))
      );
    }

    if (comprehensiveReport) {
      reportPromises.push(
        createReportPageQuick({
          parentPageId: brandedHomepage.id,
          title: `${companyName} - Comprehensive Analysis`,
          content: comprehensiveReport,
          reportType: 'comprehensive'
        }).then(page => ({
          id: page.id,
          url: `https://notion.so/${page.id.replace(/-/g, '')}`,
          title: 'Comprehensive Analysis'
        }))
      );
    }

    const reportPages = await Promise.all(reportPromises);
    results.childPages = reportPages;

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
        type: "paragraph" as const,
        paragraph: { 
          rich_text: [{ 
            text: { content: `Hey ${contactName} and the rest of the ${companyName} team!` } 
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
      ...reportPages.map(page => ({
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
          const intro = await generateHomepageIntroAsync({
            contactName,
            companyName,
            strategyReport,
            comprehensiveReport,
            accountData
          });
          // TODO: Implement placeholder replacement and apply intro blocks
          console.log(`[ASYNC] Generated homepage intro (${intro.length} chars)`);
          return intro;
        }) :
        generateHomepageIntroAsync({
          contactName,
          companyName,
          strategyReport,
          comprehensiveReport,
          accountData
        })
          .then(async (intro) => {
            console.log(`[ASYNC] Generated homepage intro (${intro.length} chars)`);
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
        : Promise.resolve()
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