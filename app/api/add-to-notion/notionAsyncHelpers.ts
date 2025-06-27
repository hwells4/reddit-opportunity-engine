import { Client } from "@notionhq/client";
import { generateReportTitleFromLLM, getHomepageIntroFromLLM } from "./notionHelpers";
import { 
  createQuotesDatabase, 
  addQuotesToNotion, 
  fetchQuotesForRun,
  getQuoteStats,
  createQuotesLinkBlock 
} from "./notionQuotesHelpers";
import { SupabaseClient } from '@supabase/supabase-js';

// Updated delay constants for different operation types
const DELAYS = {
  NOTION_BASIC: 100,           // Basic operations
  NOTION_DATABASE: 1000,       // Database operations
  NOTION_HEAVY: 2000,         // Heavy operations (large content)
  DATABASE_CREATION: 3000,     // After database creation
  BATCH_PROCESSING: 500        // Between batch items
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Add blocks to a page in chunks to respect Notion's 100-block limit
 * This prevents validation errors when adding large content
 */
async function addBlocksInChunks(
  notion: Client, 
  pageId: string, 
  blocks: any[], 
  maxChunks = 100
): Promise<boolean> {
  if (blocks.length === 0) return true;
  
  console.log(`Adding ${blocks.length} blocks in chunks of ${maxChunks}`);
  
  const chunks = [];
  for (let i = 0; i < blocks.length; i += maxChunks) {
    chunks.push(blocks.slice(i, i + maxChunks));
  }
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    try {
      await notion.blocks.children.append({
        block_id: pageId,
        children: chunk
      });
      
      console.log(`Added chunk ${i + 1}/${chunks.length} (${chunk.length} blocks)`);
      
      // Delay between chunks to prevent rate limiting
      if (i < chunks.length - 1) {
        await delay(DELAYS.NOTION_HEAVY);
      }
    } catch (error) {
      console.error(`Failed to add chunk ${i + 1}/${chunks.length}:`, error);
      throw error;
    }
  }
  
  console.log(`Successfully added all ${blocks.length} blocks in ${chunks.length} chunks`);
  return true;
}

interface AsyncProcessingOptions {
  notion: Client;
  brandedHomepageId: string;
  runId?: string;
  accountData?: any;
  companyName: string;
  runStats: { postsCount: number; quotesCount: number };
}

interface AIContentGenerationOptions {
  strategyReport?: string;
  comprehensiveReport?: string;
  contactName: string;
  companyName: string;
  accountData?: any;
}

/**
 * Generate AI title asynchronously (can be called after initial response)
 */
export async function generateAITitleAsync(
  options: Pick<AIContentGenerationOptions, 'strategyReport' | 'comprehensiveReport'>
): Promise<string> {
  try {
    const { strategyReport, comprehensiveReport } = options;
    
    if (!strategyReport && !comprehensiveReport) {
      return 'Market Research Analysis';
    }
    
    return await generateReportTitleFromLLM({ 
      strategyReport: strategyReport || '', 
      comprehensiveReport: comprehensiveReport || '' 
    });
  } catch (error) {
    console.error('Error generating AI title:', error);
    return 'Market Research Analysis';
  }
}

/**
 * Generate homepage intro content asynchronously
 */
export async function generateHomepageIntroAsync(
  options: AIContentGenerationOptions
): Promise<string> {
  try {
    const { contactName, companyName, strategyReport, comprehensiveReport, accountData } = options;
    
    const prompt = `Generate a brief, engaging introduction for ${contactName} from ${companyName}. 
    ${accountData?.industry ? `They work in the ${accountData.industry} industry.` : ''}
    ${accountData?.company_description ? `About them: ${accountData.company_description}` : ''}
    
    Summary of reports:
    ${strategyReport ? `Strategy Report: ${strategyReport.slice(0, 500)}...` : ''}
    ${comprehensiveReport ? `Comprehensive Report: ${comprehensiveReport.slice(0, 500)}...` : ''}
    
    Keep it friendly, professional, and under 3 paragraphs.`;
    
    return await getHomepageIntroFromLLM(prompt);
  } catch (error) {
    console.error('Error generating homepage intro:', error);
    return `Welcome! We've completed your market research analysis. The reports below contain valuable insights from our research.`;
  }
}

/**
 * Process quotes asynchronously (can run in background)
 */
export async function processQuotesAsync(
  options: AsyncProcessingOptions & { supabase: SupabaseClient }
): Promise<any> {
  const { notion, brandedHomepageId, runId, accountData, companyName, runStats, supabase } = options;
  
  if (!runId) {
    return null;
  }
  
  try {
    console.log(`[ASYNC] Processing quotes for run ${runId}...`);
    
    // Fetch quotes for this run
    const quotes = await fetchQuotesForRun(supabase, runId);
    
    if (quotes.length === 0) {
      console.log('[ASYNC] No quotes found for this run');
      return null;
    }
    
    console.log(`[ASYNC] Found ${quotes.length} quotes, creating dedicated database...`);
    
    // Generate database title
    const finalCompanyName = accountData?.company_name || companyName;
    const quotesDbTitle = `${finalCompanyName} - Quotes Database`;
    
    // Create dedicated quotes database
    const quotesDbId = await createQuotesDatabase(
      notion,
      brandedHomepageId,
      quotesDbTitle
    );
    
    // Add quotes to the database (with rate limiting)
    const addResult = await addQuotesToNotion(
      notion,
      quotesDbId,
      quotes
    );
    
    // Get statistics
    const stats = getQuoteStats(quotes);
    
    // Replace quotes placeholder with actual quotes link
    const quotesLinkBlocks = createQuotesLinkBlock(
      `https://notion.so/${quotesDbId.replace(/-/g, '')}`,
      runStats.postsCount,
      quotes.length
    );
    
    // Try to replace placeholder, fallback to append if not found
    const replaced = await findAndReplacePlaceholder(
      notion,
      brandedHomepageId,
      "Processing quotes database",
      quotesLinkBlocks
    );
    
    if (!replaced) {
      // Fallback: append to end of page if placeholder not found
      await notion.blocks.children.append({
        block_id: brandedHomepageId,
        children: quotesLinkBlocks,
      });
    }
    
    return {
      success: addResult.success,
      count: addResult.count,
      total: quotes.length,
      databaseId: quotesDbId,
      databaseUrl: `https://notion.so/${quotesDbId.replace(/-/g, '')}`,
      databaseTitle: quotesDbTitle,
      stats
    };
    
  } catch (error) {
    console.error('[ASYNC] Error processing quotes:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Update Notion page with AI-generated content
 * This can be called asynchronously after the initial page creation
 */
export async function updatePageWithAIContent(
  notion: Client,
  pageId: string,
  blocks: any[]
): Promise<boolean> {
  try {
    await notion.blocks.children.append({
      block_id: pageId,
      children: blocks,
    });
    return true;
  } catch (error) {
    console.error('Error updating page with AI content:', error);
    return false;
  }
}

/**
 * Create a placeholder block that will be replaced with AI content later
 */
export function createPlaceholderBlock(text: string): any {
  return {
    type: "paragraph",
    paragraph: {
      rich_text: [{
        text: {
          content: text,
          annotations: {
            italic: true,
            color: "gray"
          }
        }
      }]
    }
  };
}

/**
 * Create a loading callout block
 */
export function createLoadingBlock(message: string): any {
  return {
    type: "callout",
    callout: {
      icon: { type: "emoji", emoji: "⏳" },
      rich_text: [{
        text: { content: message }
      }]
    }
  };
}

/**
 * Find and replace placeholder blocks with actual content
 */
export async function findAndReplacePlaceholder(
  notion: Client,
  pageId: string,
  placeholderText: string,
  newBlocks: any[]
): Promise<boolean> {
  try {
    // Get all blocks from the page
    const response = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100
    });
    
    // Find the placeholder block
    const placeholderBlock = response.results.find((block: any) => {
      if (block.type === 'callout' && block.callout?.rich_text?.[0]?.text?.content) {
        return block.callout.rich_text[0].text.content.includes(placeholderText);
      }
      if (block.type === 'paragraph' && block.paragraph?.rich_text?.[0]?.text?.content) {
        return block.paragraph.rich_text[0].text.content.includes(placeholderText);
      }
      return false;
    });
    
    if (!placeholderBlock) {
      console.warn(`[PLACEHOLDER] "${placeholderText}" not found in page ${pageId}. Available blocks:`, 
        response.results.map((block: any) => ({
          type: block.type,
          content: block[block.type]?.rich_text?.[0]?.text?.content?.substring(0, 50) + '...' || 'no text'
        }))
      );
      return false;
    }
    
    // Delete the placeholder block with retry on 409
    let deleteSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await notion.blocks.delete({ block_id: placeholderBlock.id });
        deleteSuccess = true;
        break;
      } catch (deleteError: any) {
        if (deleteError.status === 409 && attempt < 3) {
          console.warn(`[RETRY ${attempt}/3] 409 conflict deleting placeholder, retrying...`);
          await delay(attempt * 300);
          continue;
        }
        throw deleteError;
      }
    }
    
    if (!deleteSuccess) {
      console.error(`Failed to delete placeholder after 3 attempts`);
      return false;
    }
    
    await delay(DELAYS.NOTION_BASIC);
    
    // Add new blocks in its place with retry on 409
    let appendSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await notion.blocks.children.append({
          block_id: pageId,
          children: newBlocks,
        });
        appendSuccess = true;
        break;
      } catch (appendError: any) {
        if (appendError.status === 409 && attempt < 3) {
          console.warn(`[RETRY ${attempt}/3] 409 conflict appending blocks, retrying...`);
          await delay(attempt * 300);
          continue;
        }
        throw appendError;
      }
    }
    
    if (appendSuccess) {
      console.log(`[SUCCESS] Replaced placeholder "${placeholderText}" with ${newBlocks.length} new blocks`);
      return true;
    } else {
      console.error(`Failed to append new blocks after 3 attempts`);
      return false;
    }
  } catch (error) {
    console.error(`[ERROR] Replacing placeholder "${placeholderText}":`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      pageId,
      blockCount: newBlocks.length
    });
    return false;
  }
}

/**
 * Convert text content to Notion blocks with basic formatting
 */
export function textToNotionBlocks(text: string): any[] {
  if (!text) return [];
  
  // Split text into paragraphs
  const paragraphs = text.split('\n\n').filter(p => p.trim());
  
  return paragraphs.map(paragraph => ({
    type: "paragraph",
    paragraph: {
      rich_text: [{
        text: { content: paragraph.trim() }
      }]
    }
  }));
}

/**
 * Update homepage with AI-generated intro content
 */
export async function updateHomepageWithIntro(
  notion: Client,
  homepageId: string,
  introContent: string
): Promise<boolean> {
  try {
    const introBlocks = textToNotionBlocks(introContent);
    
    return await findAndReplacePlaceholder(
      notion,
      homepageId,
      "Generating personalized introduction",
      introBlocks
    );
  } catch (error) {
    console.error('Error updating homepage with intro:', error);
    return false;
  }
}

/**
 * Process full report content and replace truncated content with chunked processing
 * Handles large content that exceeds Notion's 100-block limit
 */
export async function processFullReportContent(
  notion: Client,
  pageId: string,
  fullContent: string,
  reportType: 'strategy' | 'comprehensive'
): Promise<boolean> {
  try {
    // Split content into manageable chunks (Notion has a 2000 char limit per block)
    const chunks = fullContent.match(/.{1,1900}/g) || [fullContent];
    console.log(`Processing ${reportType} report: ${chunks.length} blocks`);
    
    // Convert chunks to Notion blocks
    const blocks = chunks.map(chunk => ({
      type: "paragraph" as const,
      paragraph: {
        rich_text: [{
          text: { content: chunk }
        }]
      }
    }));
    
    if (chunks.length <= 100) {
      // Small content: use existing logic
      const success = await findAndReplacePlaceholder(
        notion,
        pageId,
        "content truncated for quick loading",
        blocks
      );
      
      if (success) {
        console.log(`[ASYNC] Successfully updated ${reportType} report with full content (${chunks.length} blocks)`);
        return true;
      } else {
        console.warn(`[ASYNC] Could not find truncation placeholder in ${reportType} report, appending content`);
        // Fallback: append the full content using chunked processing
        await addBlocksInChunks(notion, pageId, blocks);
        return true;
      }
    } else {
      // Large content: use progressive loading with chunked processing
      console.log(`Large ${reportType} content detected (${chunks.length} blocks), using progressive loading...`);
      
      // Replace placeholder with loading message
      const loadingBlock = [{
        type: "callout" as const,
        callout: {
          icon: { type: "emoji" as const, emoji: "⏳" },
          rich_text: [{
            text: { content: `Loading full ${reportType} content... (${chunks.length} sections)` }
          }]
        }
      }];
      
      const placeholderReplaced = await findAndReplacePlaceholder(
        notion,
        pageId,
        "content truncated for quick loading",
        loadingBlock
      );
      
      if (!placeholderReplaced) {
        console.warn(`Placeholder not found, appending loading message`);
        await notion.blocks.children.append({
          block_id: pageId,
          children: loadingBlock
        });
      }
      
      await delay(DELAYS.NOTION_BASIC);
      
      // Process content in chunks of 90 blocks (leave buffer below 100 limit)
      await addBlocksInChunks(notion, pageId, blocks, 90);
      
      console.log(`[SUCCESS] Progressive loading complete for ${reportType} report`);
      return true;
    }
    
  } catch (error) {
    console.error(`Error processing full ${reportType} report content:`, error);
    return false;
  }
}