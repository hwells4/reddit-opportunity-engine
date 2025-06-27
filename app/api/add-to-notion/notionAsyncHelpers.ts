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
    
    // Add quotes link to homepage
    const quotesLinkBlocks = createQuotesLinkBlock(
      `https://notion.so/${quotesDbId.replace(/-/g, '')}`,
      runStats.postsCount,
      quotes.length
    );
    
    await notion.blocks.children.append({
      block_id: brandedHomepageId,
      children: quotesLinkBlocks,
    });
    
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
 * Replace placeholder blocks with actual content
 */
export async function replacePlaceholderBlocks(
  notion: Client,
  pageId: string,
  placeholderBlockId: string,
  newBlocks: any[]
): Promise<boolean> {
  try {
    // Delete the placeholder block
    await notion.blocks.delete({ block_id: placeholderBlockId });
    
    // Add new blocks
    await notion.blocks.children.append({
      block_id: pageId,
      children: newBlocks,
    });
    
    return true;
  } catch (error) {
    console.error('Error replacing placeholder blocks:', error);
    return false;
  }
}