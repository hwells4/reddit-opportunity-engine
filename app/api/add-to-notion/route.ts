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

    // Create the branded parent page
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

    const results = {
      parentPageId: parentPage.id,
      parentPageUrl: `https://notion.so/${parentPage.id.replace(/-/g, '')}`,
      childPages: [] as Array<{ id: string; url: string; title: string }>,
    };

    // Create strategy report page if provided
    if (strategyReport) {
      const strategyPage = await createReportPageFromTemplate({
        templatePageId: strategyTemplateId,
        parentPageId: parentPage.id,
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

    // Create comprehensive report page if provided
    if (comprehensiveReport) {
      const comprehensivePage = await createReportPageFromTemplate({
        templatePageId: comprehensiveTemplateId,
        parentPageId: parentPage.id,
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
      data: results,
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

  const response = await notion.pages.create({
    parent: {
      database_id: process.env.NOTION_DATABASE_ID!,
    },
    properties: {
      // Adjust these property names based on your Notion database schema
      Name: {
        title: [
          {
            text: {
              content: title,
            },
          },
        ],
      },
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
                content: "How to Use These Reports",
              },
            },
          ],
        },
      },
      {
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [
            {
              text: {
                content: 'Quick Win: Search for "Actionable Takeaways" in each report for immediate messaging improvements',
              },
            },
          ],
        },
      },
      {
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [
            {
              text: {
                content: 'Deep Dive: Review the "Key Themes" section to understand audience psychology',
              },
            },
          ],
        },
      },
      {
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [
            {
              text: {
                content: 'Copy Inspiration: Use the "Audience Voice Highlights" for ad copy and landing pages',
              },
            },
          ],
        },
      },
      {
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [
            {
              text: {
                content: 'Campaign Planning: Reference "User Needs" to prioritize messaging angles',
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
                content: "📊 Your Custom Reports",
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
                content: "Click on each report below to view the full analysis:",
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

  // Create new page in database with the template structure
  const newPage = await notion.pages.create({
    parent: {
      database_id: parentDatabaseId,
    },
    properties: adaptedProperties,
    children: templateBlocks.results.map((block: any) => {
      // Remove the id from blocks to create new ones
      const { id, ...blockWithoutId } = block;
      return blockWithoutId;
    }),
  });

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

// Add this function to create properties dynamically
function createDynamicProperties(
  availableProperties: any,
  subreddit?: string,
  email?: string,
  runId?: string
): any {
  const properties: any = {};

  // Map common property names to your data
  const propertyMappings = {
    // Common variations for each field
    title: ['Name', 'Title', 'Page Title', 'Page Name'],
    subreddit: ['Subreddit', 'Reddit', 'Community', 'Sub'],
    email: ['Email', 'Client Email', 'Contact', 'Client'],
    runId: ['Run ID', 'RunID', 'Job ID', 'Process ID', 'ID'],
    status: ['Status', 'State', 'Progress'],
    date: ['Generated Date', 'Created Date', 'Date', 'Created', 'Generated'],
  };

  // Find matching properties in your database
  Object.keys(availableProperties).forEach(propName => {
    const prop = availableProperties[propName];
    
    // Check for title/name property
    if (propertyMappings.title.includes(propName) && prop.type === 'title') {
      properties[propName] = {
        title: [
          {
            text: {
              content: `Reddit Opportunity Analysis - r/${subreddit || 'Unknown'} - ${new Date().toISOString().split('T')[0]}`,
            },
          },
        ],
      };
    }
    
    // Check for subreddit property
    else if (propertyMappings.subreddit.some(mapping => propName.includes(mapping)) && prop.type === 'rich_text') {
      properties[propName] = {
        rich_text: [
          {
            text: {
              content: subreddit || 'Unknown',
            },
          },
        ],
      };
    }
    
    // Check for email property
    else if (propertyMappings.email.some(mapping => propName.includes(mapping))) {
      if (prop.type === 'email') {
        properties[propName] = {
          email: email || null,
        };
      } else if (prop.type === 'rich_text') {
        properties[propName] = {
          rich_text: [
            {
              text: {
                content: email || 'N/A',
              },
            },
          ],
        };
      }
    }
    
    // Check for run ID property
    else if (propertyMappings.runId.some(mapping => propName.includes(mapping)) && prop.type === 'rich_text') {
      properties[propName] = {
        rich_text: [
          {
            text: {
              content: runId || 'N/A',
            },
          },
        ],
      };
    }
    
    // Check for status property
    else if (propertyMappings.status.some(mapping => propName.includes(mapping)) && prop.type === 'select') {
      // Use the first available select option or create 'Generated' if it exists
      const selectOptions = prop.select?.options || [];
      const generatedOption = selectOptions.find((opt: any) => 
        ['Generated', 'Complete', 'Done', 'Finished'].includes(opt.name)
      );
      
      if (generatedOption) {
        properties[propName] = {
          select: {
            name: generatedOption.name,
          },
        };
      } else if (selectOptions.length > 0) {
        properties[propName] = {
          select: {
            name: selectOptions[0].name,
          },
        };
      }
    }
    
    // Check for date property
    else if (propertyMappings.date.some(mapping => propName.includes(mapping)) && prop.type === 'date') {
      properties[propName] = {
        date: {
          start: new Date().toISOString(),
        },
      };
    }
  });

  return properties;
} 