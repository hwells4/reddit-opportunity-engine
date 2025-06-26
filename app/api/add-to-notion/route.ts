import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { createClient } from '@supabase/supabase-js';
import {
  generateParentPageTitle,
  extractCompanyName,
  extractContactName,
  extractReportType,
  generateHomepageIntroPrompt,
  createParentPageContent,
  getHomepageIntroFromLLM,
  generateReportTitleFromLLM,
  createHomepageBlocks
} from "./notionHelpers";
import {
  createQuotesDatabase,
  addQuotesToNotion,
  fetchQuotesForRun,
  getQuoteStats,
  createQuotesLinkBlock
} from "./notionQuotesHelpers";

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Initialize Supabase client for account data
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

// Fetch account data for enhanced personalization
async function getAccountData(accountId: string): Promise<AccountData | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('Supabase client not available, falling back to email extraction');
      return null;
    }

    const { data: account, error } = await supabase
      .from('accounts')
      .select('account_id, company_name, contact_name, email, website_url, company_description, industry')
      .eq('account_id', accountId)
      .single();

    if (error || !account) {
      console.warn(`Account ${accountId} not found, falling back to email extraction`);
      return null;
    }

    return account;
  } catch (error) {
    console.error('Error fetching account data:', error);
    return null;
  }
}

// Add debug logging utility
const DEBUG = process.env.NODE_ENV === 'development' || process.env.NOTION_DEBUG === 'true';

function debugLog(context: string, data: any) {
  if (DEBUG) {
    console.log(`[NOTION DEBUG - ${context}]:`, JSON.stringify(data, null, 2));
  }
}

// Helper function to get the banner image URL from Railway
function getBannerImageUrl(): string {
  // Get the Railway URL from environment or use a default
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
    : process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : 'https://reddit-opportunity-engine-production.up.railway.app';
  
  return `${baseUrl}/dodo-digital-audience-research-banner.png`;
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
  clientType?: 'demo' | 'existing' | 'prospect'; // For different CTAs
  accountId?: string; // Account association for enhanced personalization
  metadata?: {
    generatedAt?: string;
    analysisType?: string;
    [key: string]: any;
  };
}

// Function to generate an AI-powered title based on the reports
async function generateSmartReportTitle(strategyReport?: string, comprehensiveReport?: string): Promise<string> {
  try {
    if (!strategyReport && !comprehensiveReport) {
      return 'Market Research Analysis';
    }
    
    return await generateReportTitleFromLLM({ 
      strategyReport: strategyReport || '', 
      comprehensiveReport: comprehensiveReport || '' 
    });
  } catch (error) {
    console.error('Error generating smart title:', error);
    return 'Market Research Analysis';
  }
}

export async function POST(request: Request) {
  try {
    const body: ReportData = await request.json();
    debugLog('POST-request-body', { 
      hasStrategyReport: !!body.strategyReport,
      hasComprehensiveReport: !!body.comprehensiveReport,
      strategyReportLength: body.strategyReport?.length || 0,
      comprehensiveReportLength: body.comprehensiveReport?.length || 0,
      subreddit: body.subreddit,
      email: body.email,
      clientType: body.clientType,
      accountId: body.accountId
    });
    
    const { 
      strategyReport, 
      comprehensiveReport, 
      subreddit,
      email, 
      runId, 
      parentTemplateId,
      strategyTemplateId,
      comprehensiveTemplateId,
      homepageTemplateId,
      clientType,
      accountId,
      metadata 
    } = body;

    // Fetch account data for enhanced personalization
    let accountData: AccountData | null = null;
    if (accountId) {
      accountData = await getAccountData(accountId);
      debugLog('account-data', accountData);
    }
    
    // Generate a smart title based on the reports using AI
    const smartTitle = await generateSmartReportTitle(strategyReport, comprehensiveReport);
    debugLog('ai-generated-title', { smartTitle });

    // Validate required fields
    if (!strategyReport && !comprehensiveReport) {
      return NextResponse.json(
        { error: "At least one report (strategy or comprehensive) is required" },
        { status: 400 }
      );
    }

    if (!process.env.NOTION_API_KEY) {
      return NextResponse.json(
        { error: "Notion API key not configured" },
        { status: 500 }
      );
    }

    if (!process.env.NOTION_DATABASE_ID) {
      return NextResponse.json(
        { error: "Notion database ID not configured" },
        { status: 500 }
      );
    }

    // --- Enhanced: Use account data or extract from email ---
    const companyName = accountData?.company_name || extractCompanyName(email);
    const contactName = accountData?.contact_name || extractContactName(email);
    const reportType = extractReportType(metadata);
    const parentPageTitle = generateParentPageTitle({ 
      email: accountData?.email || email, 
      metadata, 
      reportType, 
      date: new Date(),
      accountData 
    });
    // --- Create the parent page in the database (minimal, just a link) ---
    // We'll create the homepage next and update the parent page with the homepage URL if needed
    const parentPage = await notion.pages.create({
      parent: {
        database_id: process.env.NOTION_DATABASE_ID!,
      },
      properties: {
        Company: {
          title: [
            {
              text: { content: parentPageTitle },
            },
          ],
        },
        "Report Type": {
          rich_text: [{ text: { content: reportType || '' } }]
        },
        "Contact Email": {
          email: email || ''
        },
        // Optionally fill these if you have the data:
        // "Target Audience": { rich_text: [{ text: { content: ... } }] },
        // "Report Status": { select: { name: "Generated" } },
        // "Report Code": { rich_text: [{ text: { content: runId || '' } }] },
        // "Client ID": { rich_text: [{ text: { content: ... } }] },
      },
      // We'll add the homepage link as a child block after homepage creation
    });

    // --- Now create the branded homepage as a child of the parent page ---
    const brandedHomepage = await notion.pages.create({
      parent: {
        page_id: parentPage.id,
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: smartTitle, // Use AI-generated title instead of subreddit reference
              },
            },
          ],
        },
      },
      icon: {
        type: "emoji",
        emoji: "📊"
      },
      cover: {
        type: "external",
        external: {
          url: getBannerImageUrl()
        }
      },
    });
    const homepageUrl = `https://notion.so/${brandedHomepage.id.replace(/-/g, '')}`;

    // --- Add the homepage link to the parent page as a child block ---
    await notion.blocks.children.append({
      block_id: parentPage.id,
      children: createParentPageContent({ homepageUrl }),
    });

    // --- Generate the homepage intro using LLM (OpenRouter) with account context ---
    const llmPrompt = generateHomepageIntroPrompt({
      contactName,
      companyName,
      strategyReport: strategyReport || '',
      comprehensiveReport: comprehensiveReport || '',
      accountData: accountData ? {
        industry: accountData.industry,
        company_description: accountData.company_description,
        website_url: accountData.website_url
      } : undefined
    });
    const homepageIntro = await getHomepageIntroFromLLM(llmPrompt);

    // --- Create the strategy and comprehensive report pages as children of the homepage ---
    const results = {
      parentPageId: parentPage.id,
      parentPageUrl: `https://notion.so/${parentPage.id.replace(/-/g, '')}`,
      brandedHomepageId: brandedHomepage.id,
      brandedHomepageUrl: homepageUrl,
      childPages: [] as Array<{ id: string; url: string; title: string }>,
    };

    let strategyUrl: string | undefined;
    let comprehensiveUrl: string | undefined;
    if (strategyReport) {
      const strategyPage = await createReportPageFromTemplate({
        templatePageId: strategyTemplateId,
        parentPageId: brandedHomepage.id, // Child of branded homepage
        title: `${smartTitle} - Strategy Report`, // Use AI title instead of subreddit
        content: strategyReport,
        reportType: 'strategy',
        subreddit: '', // Not subreddit-specific anymore
      });
      strategyUrl = `https://notion.so/${strategyPage.id.replace(/-/g, '')}`;
      results.childPages.push({
        id: strategyPage.id,
        url: strategyUrl,
        title: 'Strategy Report',
      });
    }

    if (comprehensiveReport) {
      const comprehensivePage = await createReportPageFromTemplate({
        templatePageId: comprehensiveTemplateId,
        parentPageId: brandedHomepage.id, // Child of branded homepage
        title: `${smartTitle} - Comprehensive Analysis`, // Use AI title instead of subreddit
        content: comprehensiveReport,
        reportType: 'comprehensive',
        subreddit: '', // Not subreddit-specific anymore
      });
      comprehensiveUrl = `https://notion.so/${comprehensivePage.id.replace(/-/g, '')}`;
      results.childPages.push({
        id: comprehensivePage.id,
        url: comprehensiveUrl,
        title: 'Comprehensive Analysis',
      });
    }

    // --- Build homepage blocks - Clean AI-generated content only ---
    const homepageBlocks: any[] = [
      // Title using AI-generated smart title
      {
        type: "heading_1",
        heading_1: { rich_text: [{ text: { content: smartTitle } }] }
      },
      // Personalized Greeting
      {
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: `Hey ${contactName} and the rest of the ${companyName} team!` } }] }
      },
      { type: "divider", divider: {} },
      // AI-Generated Intro/Summary - Parse as markdown
      ...(homepageIntro ? [
        ...createBlocksFromMarkdown(homepageIntro)
      ] : []),
      // Report Links
      ...(strategyUrl ? [{
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: "View Strategy Report", link: { url: strategyUrl } } }] }
      }] : []),
      ...(comprehensiveUrl ? [{
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: "View Comprehensive Analysis", link: { url: comprehensiveUrl } } }] }
      }] : []),
    ];

    await notion.blocks.children.append({
      block_id: brandedHomepage.id,
      children: homepageBlocks,
    });

    // --- Add quotes to Notion if runId is provided ---
    let quotesResult = null;
    if (runId) {
      try {
        console.log(`Processing quotes for run ${runId}...`);
        const supabase = getSupabaseClient();
        
        if (supabase) {
          // Fetch quotes for this run
          const quotes = await fetchQuotesForRun(supabase, runId);
          
          if (quotes.length > 0) {
            console.log(`Found ${quotes.length} quotes, creating dedicated database...`);
            
            // Generate database title based on company/run
            const finalCompanyName = accountData?.company_name || companyName;
            const quotesDbTitle = `${finalCompanyName} - Quotes Database`;
            
            // Create dedicated quotes database as child of branded homepage
            const quotesDbId = await createQuotesDatabase(
              notion,
              brandedHomepage.id,
              quotesDbTitle
            );
            
            // Add quotes to the dedicated database
            const addResult = await addQuotesToNotion(
              notion,
              quotesDbId,
              quotes
            );
            
            // Get quote statistics
            const stats = getQuoteStats(quotes);
            
            // Add quotes link block to the homepage
            const quotesLinkBlocks = createQuotesLinkBlock(
              `https://notion.so/${quotesDbId.replace(/-/g, '')}`,
              quotes.length
            );
            
            await notion.blocks.children.append({
              block_id: brandedHomepage.id,
              children: quotesLinkBlocks,
            });
            
            quotesResult = {
              success: addResult.success,
              count: addResult.count,
              total: quotes.length,
              databaseId: quotesDbId,
              databaseUrl: `https://notion.so/${quotesDbId.replace(/-/g, '')}`,
              databaseTitle: quotesDbTitle,
              stats
            };
          } else {
            console.log('No quotes found for this run');
          }
        }
      } catch (quotesError) {
        console.error('Error processing quotes:', quotesError);
        // Don't fail the entire request if quotes fail
        quotesResult = {
          success: false,
          error: quotesError instanceof Error ? quotesError.message : 'Unknown error'
        };
      }
    }

    debugLog('strategyReport-preview', strategyReport?.slice(0, 500));
    debugLog('comprehensiveReport-preview', comprehensiveReport?.slice(0, 500));

    return NextResponse.json({
      success: true,
      message: "Reports successfully added to Notion",
      data: {
        ...results,
        // Share the branded homepage URL with clients
        shareableUrl: results.brandedHomepageUrl,
        note: "Use shareableUrl for clean client presentation with branded homepage",
        // Include quotes result if available
        quotes: quotesResult
      },
      debug: {
        strategyReport: strategyReport?.slice(0, 1000),
        comprehensiveReport: comprehensiveReport?.slice(0, 1000)
      }
    });
  } catch (error) {
    console.error("Error adding to Notion:", error);
    return NextResponse.json(
      { 
        error: "Failed to add reports to Notion",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

async function createBrandedParentPage({
  subreddit,
  email,
  runId,
  metadata,
}: {
  subreddit?: string;
  email?: string;
  runId?: string;
  metadata?: any;
}) {
  const currentDate = new Date().toISOString().split('T')[0];
  const title = `Reddit Opportunity Analysis - ${currentDate}`; // Remove subreddit reference

  // Get database properties to adapt to existing schema
  const databaseProperties = await getDatabaseProperties(process.env.NOTION_DATABASE_ID!);
  
  // Create properties that match the existing database structure
  const adaptedProperties = databaseProperties 
    ? createDynamicProperties(databaseProperties, subreddit, email, runId)
    : {
        // Fallback to original structure if database detection fails
        Name: {
          title: [{ text: { content: title } }],
        },
        "Analysis Type": {
          rich_text: [{ text: { content: 'Multi-Platform Research' } }], // Replace Subreddit field
        },
        Email: {
          email: email || null,
        },
        "Run ID": {
          rich_text: [{ text: { content: runId || 'N/A' } }],
        },
        Status: {
          select: { name: 'Generated' },
        },
        "Generated Date": {
          date: { start: new Date().toISOString() },
        },
      };

  const response = await notion.pages.create({
    parent: {
      database_id: process.env.NOTION_DATABASE_ID!,
    },
    properties: adaptedProperties,
    children: [
      {
        type: "heading_1",
        heading_1: {
          rich_text: [
            {
              text: {
                content: `🎯 Market Research & Audience Intelligence`,
              },
            },
          ],
        },
      },
      {
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              text: {
                content: `Analysis completed on ${new Date().toLocaleDateString()} • Generated by Dodo Digital Research Engine`,
              },
            },
          ],
        },
      },
      {
        type: "divider",
        divider: {},
      },
      {
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              text: {
                content: "📋 How to Use These Reports",
              },
            },
          ],
        },
      },
      {
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              text: {
                content: "Review the Strategy Report for actionable insights and recommendations",
              },
            },
          ],
        },
      },
      {
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              text: {
                content: "Examine the Comprehensive Analysis for detailed market research",
              },
            },
          ],
        },
      },
      {
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              text: {
                content: "Use the insights to optimize your marketing campaigns and content strategy",
              },
            },
          ],
        },
      },
      {
        type: "divider",
        divider: {},
      },
      {
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              text: {
                content: "📊 Report Contents",
              },
            },
          ],
        },
      },
      {
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              text: {
                content: "Your detailed reports are organized as child pages below. Click on each report to access the full analysis.",
              },
            },
          ],
        },
      },
    ],
  });

  return response;
}

async function createFullReportPage({
  parentPageId,
  title,
  content,
  reportType,
  subreddit,
}: {
  parentPageId: string;
  title: string;
  content: string;
  reportType: 'strategy' | 'comprehensive';
  subreddit: string;
}) {
  // Split content into chunks that fit within Notion's limits
  // Each text block can be up to 2000 characters
  const chunks = chunkText(content, 1800); // Leave some buffer
  
  const children = [
    {
      type: "heading_1" as const,
      heading_1: {
        rich_text: [
          {
            text: {
              content: reportType === 'strategy' ? '🎯 Strategy Report' : '📊 Comprehensive Analysis',
            },
          },
        ],
      },
    },
         {
       type: "paragraph" as const,
       paragraph: {
         rich_text: [
           {
             text: {
               content: `Analysis Type: Multi-Platform Audience Research`,
             },
           },
         ],
       },
     },
     {
       type: "paragraph" as const,
       paragraph: {
         rich_text: [
           {
             text: {
               content: `Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
             },
           },
         ],
       },
     },
    {
      type: "divider" as const,
      divider: {},
    },
  ];

  // Create page first with just the header blocks (avoid 100-block limit)
  const response = await notion.pages.create({
    parent: {
      page_id: parentPageId,
    },
    properties: {
      title: {
        title: [
          {
            text: {
              content: title,
            },
          },
        ],
      },
    },
    children: children, // Just the header blocks
  });

  // Prepare all content blocks, ensuring each is under 2000 characters
  const contentBlocks: any[] = [];
  for (const chunk of chunks) {
    // Double-check chunk length and split further if needed
    if (chunk.length > 1900) {
      const subChunks = splitLongLine(chunk, 1900);
      for (const subChunk of subChunks) {
        contentBlocks.push({
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                text: {
                  content: subChunk,
                },
              },
            ],
          },
        });
      }
    } else {
              contentBlocks.push({
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                text: {
                  content: chunk,
                },
              },
            ],
          },
        });
    }
  }

  // Add content in batches of 100 blocks (Notion's limit)
  const batchSize = 100;
  for (let i = 0; i < contentBlocks.length; i += batchSize) {
    const batch = contentBlocks.slice(i, i + batchSize);
    await notion.blocks.children.append({
      block_id: response.id,
      children: batch,
    });
  }

  return response;
}

function chunkText(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  
  // First, try to split by major sections (headers)
  const sections = splitByHeaders(text);
  
  let currentChunk = '';
  
  for (const section of sections) {
    // If this entire section fits in the current chunk, add it
    if (currentChunk.length + section.length + 2 <= maxChunkSize) {
      currentChunk += (currentChunk ? '\n\n' : '') + section;
    } 
    // If the section alone is larger than max size, we need to split it further
    else if (section.length > maxChunkSize) {
      // Save current chunk if it has content
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // Split the large section by paragraphs
      const subChunks = splitLargeSection(section, maxChunkSize);
      chunks.push(...subChunks);
    }
    // Section doesn't fit in current chunk, but fits in a new chunk
    else {
      // Save current chunk
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = section;
    }
  }
  
  // Add the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.trim().length > 0);
}

function splitByHeaders(text: string): string[] {
  const sections: string[] = [];
  const lines = text.split('\n');
  let currentSection = '';
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if this is a major header (# or ##)
    if (trimmedLine.match(/^#{1,2}\s+/)) {
      // Save previous section if it exists
      if (currentSection.trim()) {
        sections.push(currentSection.trim());
      }
      // Start new section with this header
      currentSection = line;
    } else {
      // Add line to current section
      currentSection += '\n' + line;
    }
  }
  
  // Add the last section
  if (currentSection.trim()) {
    sections.push(currentSection.trim());
  }
  
  return sections;
}

function splitLargeSection(section: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  
  // Try splitting by paragraphs first
  const paragraphs = section.split('\n\n');
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed the limit
    if (currentChunk.length + paragraph.length + 2 > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } 
    // If even a single paragraph is too large, split by sentences
    else if (paragraph.length > maxChunkSize) {
      // Save current chunk if it has content
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // Split by sentences as last resort
      const sentenceChunks = splitBySentences(paragraph, maxChunkSize);
      chunks.push(...sentenceChunks);
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  // Add the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

function splitBySentences(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  
  // Split by sentences (basic approach)
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length + 1 > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  
  // Add the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

async function createPageFromTemplate({
  templatePageId,
  parentDatabaseId,
  title,
  properties,
}: {
  templatePageId: string;
  parentDatabaseId: string;
  title: string;
  properties: any;
}) {
  // First, get the template page to copy its structure
  const templatePage = await notion.pages.retrieve({ page_id: templatePageId });
  const templateBlocks = await notion.blocks.children.list({ block_id: templatePageId });

  // Get database properties to adapt to existing schema
  const databaseProperties = await getDatabaseProperties(parentDatabaseId);
  
  // Create properties that match the existing database structure
  const adaptedProperties = databaseProperties 
    ? createDynamicProperties(
        databaseProperties,
        properties.subreddit?.rich_text?.[0]?.text?.content,
        properties.email?.email,
        properties.runId?.rich_text?.[0]?.text?.content
      )
    : properties; // Fall back to provided properties

  // Find the title property name in the database
  const titleProperty = databaseProperties 
    ? Object.keys(databaseProperties).find(key => databaseProperties[key].type === 'title')
    : 'Name';

  // Ensure we have a title property
  if (titleProperty && !adaptedProperties[titleProperty]) {
    adaptedProperties[titleProperty] = {
      title: [
        {
          text: {
            content: title,
          },
        },
      ],
    };
  }

  // Prepare page creation data
  const createPageData: any = {
    parent: {
      database_id: parentDatabaseId,
    },
    properties: adaptedProperties,
  };

  // Add icon (use simple emoji to avoid template copying issues)
  createPageData.icon = {
    type: "emoji",
    emoji: "📊"
  };

  // Skip cover copying to avoid validation errors
  // TODO: Fix template cover copying later if needed
  console.log('Skipping cover copy in createPageFromTemplate to avoid validation errors');

  // Create page first, then add blocks separately to avoid 100-block limit
  let newPage;
  try {
    newPage = await notion.pages.create(createPageData);
  } catch (pageCreateError) {
    console.error('Error creating page from template, trying without cover:', pageCreateError);
    // Try again without cover if it fails
    delete createPageData.cover;
    newPage = await notion.pages.create(createPageData);
  }

  // Add blocks separately to handle large templates
  const cleanBlocks = templateBlocks.results.map((block: any) => {
    const { id, ...blockWithoutId } = block;
    return blockWithoutId;
  });

  if (cleanBlocks.length > 0) {
    try {
      await notion.blocks.children.append({
        block_id: newPage.id,
        children: cleanBlocks,
      });
    } catch (blockError) {
      console.error('Error appending blocks from template:', blockError);
      // Try to add blocks individually if bulk append fails
      for (const block of cleanBlocks) {
        try {
          await notion.blocks.children.append({
            block_id: newPage.id,
            children: [block],
          });
        } catch (individualBlockError) {
          console.error('Error appending individual block from template, skipping:', individualBlockError);
        }
      }
    }
  }

  return newPage;
}

function splitLongLine(line: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let currentIndex = 0;
  
  while (currentIndex < line.length) {
    const chunk = line.substring(currentIndex, currentIndex + maxLength);
    chunks.push(chunk);
    currentIndex += maxLength;
  }
  
  return chunks;
}

// 1. Add URL validation helper
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function createBlocksFromMarkdown(markdown: string): any[] {
  // Only log the full markdown input for debugging
  debugLog('createBlocksFromMarkdown-input', { 
    markdown, // log the full markdown, not just a preview
    totalLength: markdown.length,
    lineCount: markdown.split('\n').length
  });

  const lines = markdown.split('\n');
  const blocks: any[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (trimmedLine === '') {
      continue;
    }

    let blockType: string = "paragraph";
    let content: string = "";
    let richText: any[] = [];

    if (line.startsWith('# ')) {
      blockType = "heading_1";
      content = line.substring(2);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        heading_1: { rich_text: richText },
      });
    } else if (line.startsWith('## ')) {
      blockType = "heading_2";
      content = line.substring(3);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        heading_2: { rich_text: richText },
      });
    } else if (line.startsWith('### ')) {
      blockType = "heading_3";
      content = line.substring(4);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        heading_3: { rich_text: richText },
      });
    } else if (line.startsWith('#### ')) {
      // Add support for heading_4 (h4 is not supported in Notion, convert to heading_3)
      blockType = "heading_3";
      content = line.substring(5);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        heading_3: { rich_text: richText },
      });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blockType = "bulleted_list_item";
      content = line.substring(2);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        bulleted_list_item: { rich_text: richText },
      });
    } else if (/^\d+\.\s/.test(line)) {
      blockType = "numbered_list_item";
      content = line.replace(/^\d+\.\s/, '');
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        numbered_list_item: { rich_text: richText },
      });
    } else if (line.startsWith('> ')) {
      // Add support for quotes
      blockType = "quote";
      content = line.substring(2);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        quote: { rich_text: richText },
      });
    } else if (line.startsWith('---') || line.startsWith('***')) {
      // Add support for dividers
      blocks.push({
        type: "divider",
        divider: {},
      });
    } else {
      // Regular paragraph
      blockType = "paragraph";
      content = line;
      
      // Split long lines to avoid Notion's 2000 character limit
      if (line.length > 1900) {
        const lineChunks = splitLongLine(line, 1900);
        lineChunks.forEach((chunk: string) => {
          richText = parseRichText(chunk);
          blocks.push({
            type: blockType,
            paragraph: { rich_text: richText },
          });
        });
      } else {
        richText = parseRichText(content);
        blocks.push({
          type: blockType,
          paragraph: { rich_text: richText },
        });
      }
    }
  }
  
  return blocks;
}

interface MarkdownMatch {
  start: number;
  end: number;
  type: 'link' | 'bold' | 'italic' | 'code' | 'strikethrough';
  text: string;
  url?: string;
  rawMatch: string;
}

function parseRichText(text: string): any[] {
  if (!text || text.length === 0) {
    return [{
      type: "text",
      text: { content: "" },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: "default"
      }
    }];
  }

  // Helper to parse non-link markdown (bold, italic, code, strikethrough)
  function parseNonLinkMarkdown(segment: string): any[] {
    // Order: code > bold > italic > strikethrough
    // Code
    const codePattern = /`([^`]+?)`/g;
    let codeMatch, lastIdx = 0, result: any[] = [];
    while ((codeMatch = codePattern.exec(segment)) !== null) {
      if (codeMatch.index > lastIdx) {
        result = result.concat(parseNonLinkMarkdown(segment.substring(lastIdx, codeMatch.index)));
      }
      result.push({
        type: "text",
        text: { content: codeMatch[1] },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: true,
          color: "default"
        }
      });
      lastIdx = codeMatch.index + codeMatch[0].length;
    }
    if (lastIdx < segment.length) segment = segment.substring(lastIdx);
    else return result;

    // Bold
    const boldPattern = /\*\*([^*]+?)\*\*|__([^_]+?)__/g;
    let boldMatch;
    lastIdx = 0;
    let boldResult: any[] = [];
    while ((boldMatch = boldPattern.exec(segment)) !== null) {
      if (boldMatch.index > lastIdx) {
        boldResult = boldResult.concat(parseNonLinkMarkdown(segment.substring(lastIdx, boldMatch.index)));
      }
      const boldText = boldMatch[1] || boldMatch[2];
      boldResult.push({
        type: "text",
        text: { content: boldText },
        annotations: {
          bold: true,
          italic: false,
          strikethrough: false,
          underline: false,
          code: false,
          color: "default"
        }
      });
      lastIdx = boldMatch.index + boldMatch[0].length;
    }
    if (lastIdx < segment.length) segment = segment.substring(lastIdx);
    else return result.concat(boldResult);

    // Italic
    const italicPattern = /(?<!\*)\*([^*]+?)\*(?!\*)|(?<!_)_([^_]+?)_(?!_)/g;
    let italicMatch;
    lastIdx = 0;
    let italicResult: any[] = [];
    while ((italicMatch = italicPattern.exec(segment)) !== null) {
      if (italicMatch.index > lastIdx) {
        italicResult = italicResult.concat(parseNonLinkMarkdown(segment.substring(lastIdx, italicMatch.index)));
      }
      const italicText = italicMatch[1] || italicMatch[2];
      italicResult.push({
        type: "text",
        text: { content: italicText },
        annotations: {
          bold: false,
          italic: true,
          strikethrough: false,
          underline: false,
          code: false,
          color: "default"
        }
      });
      lastIdx = italicMatch.index + italicMatch[0].length;
    }
    if (lastIdx < segment.length) segment = segment.substring(lastIdx);
    else return result.concat(boldResult, italicResult);

    // Strikethrough
    const strikePattern = /~~([^~]+?)~~/g;
    let strikeMatch;
    lastIdx = 0;
    let strikeResult: any[] = [];
    while ((strikeMatch = strikePattern.exec(segment)) !== null) {
      if (strikeMatch.index > lastIdx) {
        strikeResult = strikeResult.concat(parseNonLinkMarkdown(segment.substring(lastIdx, strikeMatch.index)));
      }
      strikeResult.push({
        type: "text",
        text: { content: strikeMatch[1] },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: true,
          underline: false,
          code: false,
          color: "default"
        }
      });
      lastIdx = strikeMatch.index + strikeMatch[0].length;
    }
    if (lastIdx < segment.length) {
      strikeResult.push({
        type: "text",
        text: { content: segment.substring(lastIdx) },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: false,
          color: "default"
        }
      });
    }
    return result.concat(boldResult, italicResult, strikeResult);
  }

  // First, split by links
  const linkPattern = /\[\[?([^\]]+?)\]?\]\(([^)]+)\)/g;
  let lastIndex = 0;
  const richText: any[] = [];
  let match;
  while ((match = linkPattern.exec(text)) !== null) {
    // Add plain text before the link, with formatting
    if (match.index > lastIndex) {
      const plainText = text.substring(lastIndex, match.index);
      richText.push(...parseNonLinkMarkdown(plainText));
    }
    // Add the link (if valid)
    const linkText = match[1];
    const url = match[2];
    if (url && isValidUrl(url)) {
      richText.push({
        type: "text",
        text: { content: linkText, link: { url } },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: false,
          color: "default"
        }
      });
    } else {
      // If not valid, render as plain text
      richText.push({
        type: "text",
        text: { content: `[${linkText}](${url})` },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: false,
          color: "default"
        }
      });
    }
    lastIndex = match.index + match[0].length;
  }
  // Add any remaining plain text after the last link, with formatting
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    richText.push(...parseNonLinkMarkdown(remainingText));
  }
  // If no links or formatting were found, return plain text
  if (richText.length === 0) {
    return [{
      type: "text",
      text: { content: text },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: "default"
      }
    }];
  }
  return richText;
}

async function createReportPageFromTemplate({
  templatePageId,
  parentPageId,
  title,
  content,
  reportType,
  subreddit,
}: {
  templatePageId?: string;
  parentPageId: string;
  title: string;
  content: string;
  reportType: 'strategy' | 'comprehensive';
  subreddit: string;
}) {
  // Always parse markdown into Notion blocks
  const blocks = createBlocksFromMarkdown(content);

  if (templatePageId) {
    // Use template if provided
    const templateBlocks = await notion.blocks.children.list({ block_id: templatePageId });
    // Compose all blocks: template, divider, then markdown blocks
    const allBlocks = [
      ...templateBlocks.results.map((block: any) => {
        const { id, ...blockWithoutId } = block;
        return blockWithoutId;
      }),
      { type: "divider", divider: {} },
      ...blocks,
    ];
    // Create the page with up to 100 blocks
    const initialBlocks = allBlocks.slice(0, 100);
    const newPage = await notion.pages.create({
      parent: {
        page_id: parentPageId,
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
      },
      cover: {
        type: "external",
        external: {
          url: getBannerImageUrl()
        }
      },
      children: initialBlocks,
    });
    // Append the rest in batches of 100
    for (let i = 100; i < allBlocks.length; i += 100) {
      const batch = allBlocks.slice(i, i + 100);
      await notion.blocks.children.append({
        block_id: newPage.id,
        children: batch,
      });
    }
    return newPage;
  } else {
    // No template, just create a page with parsed markdown blocks
    const initialBlocks = blocks.slice(0, 100);
    const newPage = await notion.pages.create({
      parent: {
        page_id: parentPageId,
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
      },
      cover: {
        type: "external",
        external: {
          url: getBannerImageUrl()
        }
      },
      children: initialBlocks,
    });
    // Append the rest in batches of 100
    for (let i = 100; i < blocks.length; i += 100) {
      const batch = blocks.slice(i, i + 100);
      await notion.blocks.children.append({
        block_id: newPage.id,
        children: batch,
      });
    }
    return newPage;
  }
}

// Add this function to adapt to different database schemas
async function getDatabaseProperties(databaseId: string) {
  try {
    const database = await notion.databases.retrieve({ database_id: databaseId });
    return database.properties;
  } catch (error) {
    console.error('Error fetching database properties:', error);
    return null;
  }
}

// Completely dynamic property mapper - works with any database structure
function createDynamicProperties(
  availableProperties: any,
  subreddit?: string,
  email?: string,
  runId?: string
): any {
  const properties: any = {};
  const title = `Reddit Opportunity Analysis - r/${subreddit || 'Unknown'} - ${new Date().toISOString().split('T')[0]}`;

  // Mapping rules for common property types - completely flexible
  const dataMapping = {
    // For title properties, use the report title
    title: () => ({ title: [{ text: { content: title } }] }),
    
    // For email properties, use the provided email
    email: () => ({ email: email || null }),
    
    // For rich_text properties, map based on common naming patterns
    rich_text: (propName: string) => {
      const name = propName.toLowerCase();
      
      if (name.includes('company') || name.includes('client') || name.includes('business')) {
        return { rich_text: [{ text: { content: subreddit ? `r/${subreddit} Analysis` : 'Reddit Analysis' } }] };
      }
      if (name.includes('type') || name.includes('category')) {
        return { rich_text: [{ text: { content: 'Reddit Opportunity Analysis' } }] };
      }
      if (name.includes('audience') || name.includes('target')) {
        return { rich_text: [{ text: { content: `r/${subreddit || 'Unknown'} community` } }] };
      }
      if (name.includes('code') || name.includes('id') || name.includes('reference')) {
        return { rich_text: [{ text: { content: runId || 'N/A' } }] };
      }
      if (name.includes('note') || name.includes('comment') || name.includes('summary')) {
        return { rich_text: [{ text: { content: 'Generated via automated pipeline' } }] };
      }
      if (name.includes('contact') || name.includes('person')) {
        return { rich_text: [{ text: { content: email || 'N/A' } }] };
      }
      if (name.includes('industry') || name.includes('niche')) {
        return { rich_text: [{ text: { content: 'Social Media/Reddit Marketing' } }] };
      }
      // Default for unrecognized rich_text fields
      return { rich_text: [{ text: { content: 'Reddit Opportunity Analysis' } }] };
    },
    
    // For phone properties
    phone_number: () => ({ phone_number: null }),
    
    // For number properties, map based on naming patterns
    number: (propName: string) => {
      const name = propName.toLowerCase();
      if (name.includes('report') && name.includes('count')) {
        return { number: 1 }; // This is one report
      }
      if (name.includes('value') || name.includes('price')) {
        return { number: null }; // Let user fill this
      }
      return { number: 1 }; // Default to 1
    },
    
    // For date properties
    date: () => ({ date: { start: new Date().toISOString() } }),
    
    // For select properties, try to find a suitable option
    select: (propName: string, prop: any) => {
      const name = propName.toLowerCase();
      const options = prop.select?.options || [];
      
      if (name.includes('status')) {
        // Look for completion-related options
        const goodOptions = options.find((opt: any) => 
          ['Generated', 'Complete', 'Done', 'Delivered', 'Ready', 'Active', 'New'].includes(opt.name)
        );
        if (goodOptions) return { select: { name: goodOptions.name } };
      }
      
      if (name.includes('automation')) {
        const autoOptions = options.find((opt: any) => 
          ['Full-Auto', 'Automated', 'Auto'].includes(opt.name)
        );
        if (autoOptions) return { select: { name: autoOptions.name } };
      }
      
      // Default to first option if available
      if (options.length > 0) {
        return { select: { name: options[0].name } };
      }
      return null;
    },
    
    // For status properties (newer Notion feature)
    status: (propName: string, prop: any) => {
      const options = prop.status?.options || [];
      const goodOptions = options.find((opt: any) => 
        ['Generated', 'Complete', 'Done', 'Delivered', 'Ready', 'Active'].includes(opt.name)
      );
      if (goodOptions) return { status: { name: goodOptions.name } };
      if (options.length > 0) return { status: { name: options[0].name } };
      return null;
    },
    
    // For multi-select properties
    multi_select: (propName: string, prop: any) => {
      const name = propName.toLowerCase();
      if (name.includes('tag') || name.includes('category')) {
        return { multi_select: [{ name: 'Reddit Analysis' }] };
      }
      return { multi_select: [] };
    }
  };

  // Apply mapping to each property in the database
  Object.keys(availableProperties).forEach(propName => {
    const prop = availableProperties[propName];
    const mapper = dataMapping[prop.type as keyof typeof dataMapping];
    
    if (mapper) {
      let result;
      if (typeof mapper === 'function') {
        if (prop.type === 'rich_text' || prop.type === 'number') {
          result = (mapper as (propName: string) => any)(propName);
        } else if (prop.type === 'select' || prop.type === 'status' || prop.type === 'multi_select') {
          result = (mapper as (propName: string, prop: any) => any)(propName, prop);
        } else {
          result = (mapper as () => any)();
        }
      }
      
      if (result) {
        properties[propName] = result;
      }
    }
  });

  return properties;
}

async function createBrandedHomepageFromTemplate({
  templatePageId,
  parentPageId,
  subreddit,
  email,
  runId,
  clientType,
  metadata,
}: {
  templatePageId?: string;
  parentPageId: string;
  subreddit?: string;
  email?: string;
  runId?: string;
  clientType?: 'demo' | 'existing' | 'prospect';
  metadata?: any;
}) {
  // Use template if provided, otherwise create basic branded page
  if (templatePageId) {
    console.log(`Creating branded homepage from template ${templatePageId} as child of ${parentPageId}`);
    
    // Get the template page to copy its properties (including icon and cover)
    const templatePage = await notion.pages.retrieve({ page_id: templatePageId });
    console.log('Template page retrieved:', {
      id: templatePageId,
      hasIcon: !!(templatePage as any).icon,
      hasCover: !!(templatePage as any).cover
    });

    // Create new page with template's visual properties
    const createPageData: any = {
      parent: {
        page_id: parentPageId,
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: `Market Research & Audience Intelligence Reports`,
              },
            },
          ],
        },
      },
    };

    // For now, just use a simple emoji icon instead of copying template icon
    // TODO: Fix template icon copying later
    createPageData.icon = {
      type: "emoji",
      emoji: "📊"
    };
    
    // Add our custom hosted banner image instead of copying template cover
    createPageData.cover = {
      type: "external",
      external: {
        url: getBannerImageUrl()
      }
    };
    console.log('Adding custom banner image:', getBannerImageUrl());

    // Create the new page with visual branding
    let newPage;
    try {
      newPage = await notion.pages.create(createPageData);
      console.log('New page created with branding:', {
        id: newPage.id,
        hasIcon: !!(newPage as any).icon,
        hasCover: !!(newPage as any).cover
      });
    } catch (pageCreateError) {
      console.error('Error creating page with branding, trying without cover:', pageCreateError);
      // Try again without cover if it fails
      delete createPageData.cover;
      newPage = await notion.pages.create(createPageData);
      console.log('New page created without cover fallback:', newPage.id);
    }

    // Get the template blocks and copy them
    try {
      const templateBlocks = await notion.blocks.children.list({ 
        block_id: templatePageId,
        page_size: 100 
      });

      // Process and add template blocks with dynamic content
      const processedBlocks = templateBlocks.results
        .map((block: any) => {
          try {
            const { id, ...blockWithoutId } = block;
            return replaceTemplateContent(blockWithoutId, subreddit, email, runId, clientType, metadata);
          } catch (blockProcessError) {
            console.error('Error processing block, skipping:', blockProcessError);
            return null;
          }
        })
        .filter(Boolean); // Remove null blocks

      // Add all the template blocks to the new page
      if (processedBlocks.length > 0) {
        try {
          await notion.blocks.children.append({
            block_id: newPage.id,
            children: processedBlocks,
          });
        } catch (blockAppendError) {
          console.error('Error appending template blocks:', blockAppendError);
          // Try to add blocks individually if bulk append fails
          for (const block of processedBlocks) {
            try {
              await notion.blocks.children.append({
                block_id: newPage.id,
                children: [block],
              });
            } catch (individualBlockError) {
              console.error('Error appending individual block, skipping:', individualBlockError);
            }
          }
        }
      }

      // Add dynamic CTA at the end based on client type
      const ctaBlocks = generateCTABlocks(clientType);
      if (ctaBlocks.length > 0) {
        try {
          await notion.blocks.children.append({
            block_id: newPage.id,
            children: ctaBlocks,
          });
        } catch (ctaError) {
          console.error('Error adding CTA blocks:', ctaError);
        }
      }
    } catch (templateError) {
      console.error('Error copying template blocks:', templateError);
      // Continue without template blocks if they fail
    }

    return newPage;
  } else {
    // Fallback: create basic branded page without template
    return notion.pages.create({
      parent: {
        page_id: parentPageId,
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: `Market Research & Audience Intelligence Reports`,
              },
            },
          ],
        },
      },
      icon: {
        type: "emoji",
        emoji: "📊"
      },
      cover: {
        type: "external",
        external: {
          url: getBannerImageUrl()
        }
      },
      children: [
        {
          type: "heading_1",
          heading_1: {
            rich_text: [
              {
                text: {
                  content: "Dodo Digital",
                },
              },
            ],
          },
        },
        {
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                text: {
                  content: "Audience Research & Automation",
                },
              },
            ],
          },
        },
        {
          type: "divider",
          divider: {},
        },
        {
          type: "heading_1",
          heading_1: {
            rich_text: [
              {
                text: {
                  content: `Market Research & Audience Intelligence Reports`,
                },
              },
            ],
          },
        },
        {
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                text: {
                  content: `Analysis completed on ${new Date().toLocaleDateString()} • Generated by Dodo Digital Research Engine`,
                },
              },
            ],
          },
        },
      ],
    });
  }
}

function replaceTemplateContent(block: any, subreddit?: string, email?: string, runId?: string, clientType?: 'demo' | 'existing' | 'prospect', metadata?: any): any {
  // Replace dynamic content in text blocks
  if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
    const headingType = block.type as 'heading_1' | 'heading_2' | 'heading_3';
    if (block[headingType]?.rich_text) {
      block[headingType].rich_text = block[headingType].rich_text.map((text: any) => {
        if (text.text?.content) {
          text.text.content = replacePlaceholders(text.text.content, subreddit, email, runId, clientType, metadata);
        }
        return text;
      });
    }
  }

  if (block.type === 'paragraph') {
    if (block.paragraph?.rich_text) {
      block.paragraph.rich_text = block.paragraph.rich_text.map((text: any) => {
        if (text.text?.content) {
          text.text.content = replacePlaceholders(text.text.content, subreddit, email, runId, clientType, metadata);
        }
        return text;
      });
    }
  }

  return block;
}

function replacePlaceholders(content: string, subreddit?: string, email?: string, runId?: string, clientType?: 'demo' | 'existing' | 'prospect', metadata?: any): string {
  const clientName = email ? email.split('@')[0] : 'there';
  const companyName = email ? email.split('@')[1]?.split('.')[0] || 'your company' : 'your company';
  
  return content
    .replace(/\{\{Company Name\}\}/g, companyName)
    .replace(/\{\{Contact Name\}\}/g, clientName)
    .replace(/\{\{Report Name\}\}/g, `Market Research & Audience Intelligence`)
    .replace(/\{\{Audience\}\}/g, `Multi-platform audience research`)
    .replace(/{DYNAMIC_TITLE}/g, `Market Research & Audience Intelligence Reports`)
    .replace(/{SUBREDDIT}/g, 'Multi-Platform')
    .replace(/{CLIENT_EMAIL}/g, email || 'team@dododigital.com')
    .replace(/{RUN_ID}/g, runId || 'N/A')
    .replace(/{DATE}/g, new Date().toLocaleDateString())
    .replace(/{CLIENT_GREETING}/g, `Hey ${clientName}!`)
    .replace(/{ANALYSIS_DETAILS}/g, `Comprehensive audience research across multiple platforms`);
}

function generateCTABlocks(clientType?: 'demo' | 'existing' | 'prospect'): any[] {
  if (clientType === 'demo') {
    return [
      {
        type: "divider",
        divider: {},
      },
      {
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              text: {
                content: "🚀 Want More Insights Like This?",
              },
            },
          ],
        },
      },
      {
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              text: {
                content: "This is just a taste of what we can do for your marketing campaigns. Get detailed audience intelligence reports for any social platform or digital community.",
              },
            },
          ],
        },
      },
      {
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              text: {
                content: "📧 Email harrison@dododigital.com to discuss pricing and get started with regular audience research.",
              },
            },
          ],
        },
      },
    ];
  } else if (clientType === 'existing') {
    return [
      {
        type: "divider",
        divider: {},
      },
      {
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              text: {
                content: "Questions or Need Another Report?",
              },
            },
          ],
        },
      },
      {
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              text: {
                content: "Hope you found this analysis helpful! If you have any questions about implementing these insights or want to request analysis for another market segment, just let me know.",
              },
            },
          ],
        },
      },
      {
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              text: {
                content: "📧 Reply to your original email or reach out via Slack - I'll get back to you within 48 hours!",
              },
            },
          ],
        },
      },
    ];
  } else {
    // Default/prospect - no CTA
    return [];
  }
}

// When creating blocks from markdown, log the parsed blocks
// Patch createBlocksFromMarkdown to log output
const originalCreateBlocksFromMarkdown = createBlocksFromMarkdown;
function createBlocksFromMarkdownWithDebug(markdown: string): any[] {
  const blocks = originalCreateBlocksFromMarkdown(markdown);
  debugLog('parsedBlocks', { preview: markdown.slice(0, 200), blockCount: blocks.length, blocks: blocks.slice(0, 5) });
  return blocks;
}
// Replace the function globally
(global as any).createBlocksFromMarkdown = createBlocksFromMarkdownWithDebug;

// When sending to Notion, log the payload
// Patch notion.pages.create and notion.blocks.children.append
const originalPagesCreate = notion.pages.create.bind(notion.pages);
notion.pages.create = async function(payload: any) {
  debugLog('notion.pages.create-payload', payload);
  return await originalPagesCreate(payload);
};
const originalBlocksChildrenAppend = notion.blocks.children.append.bind(notion.blocks.children);
notion.blocks.children.append = async function(payload: any) {
  debugLog('notion.blocks.children.append-payload', payload);
  return await originalBlocksChildrenAppend(payload);
};

 