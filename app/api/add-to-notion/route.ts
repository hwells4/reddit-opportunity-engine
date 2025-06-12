import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

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
  metadata?: {
    generatedAt?: string;
    analysisType?: string;
    [key: string]: any;
  };
}

export async function POST(request: Request) {
  try {
    const body: ReportData = await request.json();
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
      metadata 
    } = body;

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

    // Create the branded parent page in database (for internal tracking)
    const parentPage = parentTemplateId 
      ? await createPageFromTemplate({
          templatePageId: parentTemplateId,
          parentDatabaseId: process.env.NOTION_DATABASE_ID!,
          title: `Reddit Opportunity Analysis - r/${subreddit || 'Unknown'} - ${new Date().toISOString().split('T')[0]}`,
          properties: {
            Subreddit: {
              rich_text: [
                {
                  text: {
                    content: subreddit || 'Unknown',
                  },
                },
              ],
            },
            Email: {
              email: email || null,
            },
            "Run ID": {
              rich_text: [
                {
                  text: {
                    content: runId || 'N/A',
                  },
                },
              ],
            },
            Status: {
              select: {
                name: 'Generated',
              },
            },
            "Generated Date": {
              date: {
                start: new Date().toISOString(),
              },
            },
          },
        })
      : await createBrandedParentPage({
          subreddit,
          email,
          runId,
          metadata,
        });

    // Create the branded homepage from template (child of database entry)
    const brandedHomepage = await createBrandedHomepageFromTemplate({
      templatePageId: homepageTemplateId || process.env.NOTION_HOMEPAGE_TEMPLATE_ID,
      parentPageId: parentPage.id,
      subreddit,
      email,
      runId,
      clientType,
      metadata,
    });

    const results = {
      parentPageId: parentPage.id,
      parentPageUrl: `https://notion.so/${parentPage.id.replace(/-/g, '')}`,
      brandedHomepageId: brandedHomepage.id,
      brandedHomepageUrl: `https://notion.so/${brandedHomepage.id.replace(/-/g, '')}`,
      childPages: [] as Array<{ id: string; url: string; title: string }>,
    };

    // Create strategy report page if provided (as child of branded homepage)
    if (strategyReport) {
      const strategyPage = await createReportPageFromTemplate({
        templatePageId: strategyTemplateId,
        parentPageId: brandedHomepage.id, // Child of branded homepage, not database entry
        title: `Strategy Report - r/${subreddit || 'Unknown'}`,
        content: strategyReport,
        reportType: 'strategy',
        subreddit: subreddit || 'Unknown',
      });
      results.childPages.push({
        id: strategyPage.id,
        url: `https://notion.so/${strategyPage.id.replace(/-/g, '')}`,
        title: 'Strategy Report',
      });
    }

    // Create comprehensive report page if provided (as child of branded homepage)
    if (comprehensiveReport) {
      const comprehensivePage = await createReportPageFromTemplate({
        templatePageId: comprehensiveTemplateId,
        parentPageId: brandedHomepage.id, // Child of branded homepage, not database entry
        title: `Comprehensive Analysis - r/${subreddit || 'Unknown'}`,
        content: comprehensiveReport,
        reportType: 'comprehensive',
        subreddit: subreddit || 'Unknown',
      });
      results.childPages.push({
        id: comprehensivePage.id,
        url: `https://notion.so/${comprehensivePage.id.replace(/-/g, '')}`,
        title: 'Comprehensive Analysis',
      });
    }

    return NextResponse.json({
      success: true,
      message: "Reports successfully added to Notion",
      data: {
        ...results,
        // Share the branded homepage URL with clients
        shareableUrl: results.brandedHomepageUrl,
        note: "Use shareableUrl for clean client presentation with branded homepage"
      },
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
  const title = `Reddit Opportunity Analysis - r/${subreddit || 'Unknown'} - ${currentDate}`;

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
        Subreddit: {
          rich_text: [{ text: { content: subreddit || 'Unknown' } }],
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
                content: `🎯 Reddit Opportunity Analysis for r/${subreddit || 'Unknown'}`,
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
                content: `Analysis completed on ${new Date().toLocaleDateString()} • Generated by Reddit Opportunity Engine`,
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
               content: `Target Audience: r/${subreddit} community members`,
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

  // Add content chunks as paragraph blocks
  chunks.forEach(chunk => {
    children.push({
      type: "paragraph" as const,
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
  });

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
    children: children,
  });

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

function createBlocksFromMarkdown(markdown: string): any[] {
  const lines = markdown.split('\n');
  const blocks: any[] = [];
  
  for (const line of lines) {
    if (line.startsWith('# ')) {
      blocks.push({
        type: "heading_1",
        heading_1: {
          rich_text: [
            {
              text: {
                content: line.substring(2),
              },
            },
          ],
        },
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              text: {
                content: line.substring(3),
              },
            },
          ],
        },
      });
    } else if (line.startsWith('### ')) {
      blocks.push({
        type: "heading_3",
        heading_3: {
          rich_text: [
            {
              text: {
                content: line.substring(4),
              },
            },
          ],
        },
      });
    } else if (line.trim() !== '') {
      blocks.push({
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              text: {
                content: line,
              },
            },
          ],
        },
      });
    }
  }
  
  return blocks;
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
  if (templatePageId) {
    // Use template if provided
    const templateBlocks = await notion.blocks.children.list({ block_id: templatePageId });
    
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
      children: [
        // First add template blocks
        ...templateBlocks.results.map((block: any) => {
          const { id, ...blockWithoutId } = block;
          return blockWithoutId;
        }),
        // Then add a divider and the actual content
        {
          type: "divider",
          divider: {},
        },
      ],
    });

    // Add content in chunks to avoid 100-block limit
    const chunks = chunkText(content, 1800);
    for (const chunk of chunks) {
      const blocks = createBlocksFromMarkdown(chunk);
      if (blocks.length > 0) {
        await notion.blocks.children.append({
          block_id: newPage.id,
          children: blocks,
        });
      }
    }

    return newPage;
  } else {
    // Fall back to original method
    return createFullReportPage({
      parentPageId,
      title,
      content,
      reportType,
      subreddit,
    });
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
                content: `Audience Intelligence Reports for r/${subreddit || 'Unknown'}`,
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
    
    // Skip cover copying for now to avoid validation errors
    // TODO: Fix template cover copying later if needed
    console.log('Skipping cover copy to avoid validation errors');

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
                content: `Audience Intelligence Reports for r/${subreddit || 'Unknown'}`,
              },
            },
          ],
        },
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
                  content: `Audience Intelligence Reports for r/${subreddit || 'Unknown'}`,
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
                  content: `Analysis completed on ${new Date().toLocaleDateString()} • Generated by Reddit Opportunity Engine`,
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
    .replace(/\{\{Report Name\}\}/g, `Reddit Analysis for r/${subreddit || 'Unknown'}`)
    .replace(/\{\{Audience\}\}/g, `r/${subreddit || 'Unknown'} community members`)
    .replace(/{DYNAMIC_TITLE}/g, `Audience Intelligence Reports for r/${subreddit || 'Unknown'}`)
    .replace(/{SUBREDDIT}/g, subreddit || 'Unknown')
    .replace(/{CLIENT_EMAIL}/g, email || 'Unknown')
    .replace(/{RUN_ID}/g, runId || 'N/A')
    .replace(/{DATE}/g, new Date().toLocaleDateString())
    .replace(/{CLIENT_GREETING}/g, `Hey ${clientName}!`)
    .replace(/{ANALYSIS_DETAILS}/g, `Reddit community analysis for r/${subreddit || 'Unknown'}`);
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
                content: "This is just a taste of what we can do for your marketing campaigns. Get detailed audience intelligence reports for any Reddit community or social platform.",
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
                content: "Hope you found this analysis helpful! If you have any questions about implementing these insights or want to request analysis for another community, just let me know.",
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

 