import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { ProcessingMonitor } from '../../../utils/processing-monitor'

function getSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

interface ProcessedPostData {
  run_id: string
  posts: Array<{
    post_id: string
    subreddit: string
    url: string
    title: string
    body: string
    comments?: string
    created_utc?: string
    raw_analysis: string
  }>
}

interface ParsedQuote {
  text: string                    // REQUIRED: The actual quote text
  category?: string               // Optional: defaults to 'general'
  is_relevant?: boolean          // Optional: defaults to true
  sentiment?: string             // Optional: defaults to 'neutral'
  theme?: string                 // Optional: defaults to 'general'
}

interface ProcessingResult {
  success: boolean
  postSaved: boolean
  quotesCount: number
  errors: ProcessingError[]
  fallbacksUsed: string[]
}

interface ProcessingError {
  type: 'post_insertion' | 'quote_parsing' | 'quote_insertion' | 'validation'
  message: string
  details?: any
}


class AnalysisParser {
  static extractRelevanceScore(content: string): number {
    try {
      const patterns = [
        /<relevance_score>(\d+)/,
        /^(\d+)/,
        /score:?\s*(\d+)/i
      ];
      
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) return parseInt(match[1]);
      }
      
      return 5; // Default score
    } catch {
      return 5;
    }
  }

  static extractQuestionFlag(content: string): boolean {
    try {
      const match = content.match(/<question_relevance_flag>(TRUE|FALSE)/);
      return match ? match[1] === 'TRUE' : true;
    } catch {
      return true;
    }
  }

  static extractContentClassification(content: string): string {
    try {
      const match = content.match(/<content_classification>([\s\S]*?)<\/content_classification>/);
      return match ? match[1].trim() : 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }

}

class QuoteExtractor {
  /**
   * Normalize a quote to ensure it has all required fields with sensible defaults
   */
  private static normalizeQuote(partialQuote: { text: string, [key: string]: any }): ParsedQuote {
    return {
      text: partialQuote.text.trim(),
      category: partialQuote.category || 'general',
      is_relevant: partialQuote.is_relevant !== undefined ? partialQuote.is_relevant : true,
      sentiment: partialQuote.sentiment || 'neutral',
      theme: partialQuote.theme || 'general'
    };
  }
  static extractQuotesFromSection(content: string, sectionName: string): Array<{text: string, is_question_relevant: boolean, sentiment: string, theme: string}> {
    const quotes: Array<{text: string, is_question_relevant: boolean, sentiment: string, theme: string}> = [];
    
    try {
      const sectionRegex = new RegExp(`<${sectionName}>([\\s\\S]*?)<\\/${sectionName}>`);
      const sectionMatch = content.match(sectionRegex);
      
      if (!sectionMatch) return quotes;
      
      const sectionContent = sectionMatch[1];
      
      // Enhanced pattern to capture sentiment and theme attributes
      const enhancedPattern = /<quote\s+is_question_relevant="(true|false)"\s+sentiment="([^"]*?)"\s+theme="([^"]*?)"[^>]*>(.*?)<\/quote>/g;
      const basicPattern = /<quote\s+is_question_relevant="(true|false)"[^>]*>(.*?)<\/quote>/g;
      const fallbackPattern = /<quote[^>]*>(.*?)<\/quote>/g;
      
      const patterns = [enhancedPattern, basicPattern, fallbackPattern];
      
      for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(sectionContent)) !== null) {
          let text, isRelevant, sentiment, theme;
          
          if (pattern === enhancedPattern) {
            // Full attribute extraction
            isRelevant = match[1] === 'true';
            sentiment = match[2] || 'neutral';
            theme = match[3] || 'general';
            text = match[4];
          } else if (pattern === basicPattern) {
            // Basic extraction with defaults
            isRelevant = match[1] === 'true';
            sentiment = 'neutral';
            theme = 'general';
            text = match[2];
          } else {
            // Fallback extraction
            isRelevant = true;
            sentiment = 'neutral';
            theme = 'general';
            text = match[1];
          }
          
          text = this.cleanQuoteText(text);
          
          if (text.length > 10) {
            quotes.push({
              text: text,
              is_question_relevant: isRelevant,
              sentiment: sentiment || 'neutral',
              theme: theme || 'general'
            });
          }
        }
        
        if (quotes.length > 0) break;
      }
      
    } catch (error) {
      console.error(`Error extracting ${sectionName}:`, error);
    }
    
    return quotes;
  }

  private static cleanQuoteText(text: string): string {
    return text
      .replace(/^[A-Za-z]+-[A-Za-z0-9]+:\s*/, '')
      .replace(/^["']|["']$/g, '')
      .trim();
  }

  static extractAllQuotes(rawAnalysis: string): { quotes: ParsedQuote[], errors: ProcessingError[], fallbacksUsed: string[] } {
    const result = {
      quotes: [] as ParsedQuote[],
      errors: [] as ProcessingError[],
      fallbacksUsed: [] as string[]
    };
    
    try {
      // First attempt: Structured section extraction
      const quotes = this.extractWithStructuredSections(rawAnalysis);
      if (quotes.length > 0) {
        result.quotes = quotes;
        return result;
      }
      
      // Fallback 1: Generic quote extraction
      result.fallbacksUsed.push('generic_extraction');
      const genericQuotes = this.extractWithGenericPatterns(rawAnalysis);
      if (genericQuotes.length > 0) {
        result.quotes = genericQuotes;
        return result;
      }
      
      // Fallback 2: Any text in quotes
      result.fallbacksUsed.push('text_in_quotes');
      const textQuotes = this.extractAnyQuotedText(rawAnalysis);
      if (textQuotes.length > 0) {
        result.quotes = textQuotes;
        return result;
      }
      
      // Fallback 3: Extract any sentences that look like user feedback
      result.fallbacksUsed.push('sentence_extraction');
      const sentences = this.extractAnySentences(rawAnalysis);
      if (sentences.length > 0) {
        result.quotes = sentences;
        return result;
      }
      
      // Final fallback: Save as unstructured
      result.fallbacksUsed.push('unstructured_fallback');
      result.quotes = this.createUnstructuredFallback(rawAnalysis);
      
    } catch (error: any) {
      result.errors.push({
        type: 'quote_parsing',
        message: 'All quote extraction methods failed',
        details: error.message
      });
      
      // Even if everything fails, create a fallback quote
      result.fallbacksUsed.push('emergency_fallback');
      result.quotes = this.createUnstructuredFallback(rawAnalysis);
    }
    
    return result;
  }

  private static extractWithStructuredSections(rawAnalysis: string): ParsedQuote[] {
    const allQuotes: ParsedQuote[] = [];
    
    const sections = [
      { name: 'user_needs', category: 'user_needs' },
      { name: 'user_language', category: 'user_language' },
      { name: 'current_solutions', category: 'current_solutions' },
      { name: 'feature_signals', category: 'feature_signals' }
    ];
    
    for (const section of sections) {
      try {
        const sectionQuotes = this.extractQuotesFromSection(rawAnalysis, section.name);
        sectionQuotes.forEach(quote => {
          const normalizedQuote = this.normalizeQuote({
            text: quote.text,
            category: section.category,
            is_relevant: quote.is_question_relevant,
            sentiment: quote.sentiment,
            theme: quote.theme
          });
          allQuotes.push(normalizedQuote);
        });
      } catch (error) {
        // Continue with other sections even if one fails
        continue;
      }
    }
    
    return allQuotes;
  }

  private static extractWithGenericPatterns(rawAnalysis: string): ParsedQuote[] {
    const quotes: ParsedQuote[] = [];
    
    try {
      // Look for any <quote> tags regardless of context
      const genericPattern = /<quote[^>]*?(?:category="([^"]*?)")?[^>]*?(?:sentiment="([^"]*?)")?[^>]*?(?:theme="([^"]*?)")?[^>]*?>(.*?)<\/quote>/g;
      let match: RegExpExecArray | null;
      
      while ((match = genericPattern.exec(rawAnalysis)) !== null) {
        const text = this.cleanQuoteText(match[4]);
        if (text.length > 10) {
          const normalizedQuote = this.normalizeQuote({
            text: text,
            category: match[1],
            is_relevant: true,
            sentiment: match[2],
            theme: match[3]
          });
          quotes.push(normalizedQuote);
        }
      }
    } catch (error) {
      // If regex fails, return empty array
    }
    
    return quotes;
  }

  private static extractAnyQuotedText(rawAnalysis: string): ParsedQuote[] {
    const quotes: ParsedQuote[] = [];
    
    try {
      // Look for text in various quote marks
      const patterns = [
        /"([^"]{20,500})"/g,           // Double quotes
        /'([^']{20,500})'/g,           // Single quotes
        /["""]([^"""]{20,500})["""]/g  // Smart quotes
      ];
      
      for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(rawAnalysis)) !== null) {
          const text = match[1].trim();
          if (text.length > 20 && text.length < 500) {
            const normalizedQuote = this.normalizeQuote({
              text: text,
              category: 'extracted_text',
              is_relevant: false,
              sentiment: 'neutral',
              theme: 'general'
            });
            quotes.push(normalizedQuote);
          }
        }
        
        if (quotes.length > 0) break; // Stop after first successful pattern
      }
    } catch (error) {
      // If regex fails, return empty array
    }
    
    return quotes.slice(0, 10); // Limit to prevent spam
  }

  private static extractAnySentences(rawAnalysis: string): ParsedQuote[] {
    const quotes: ParsedQuote[] = [];
    
    try {
      // Look for complete sentences that might be user feedback
      const sentencePatterns = [
        // Sentences with emotional indicators
        /([^.!?]*(?:love|hate|frustrated|annoying|difficult|easy|wish|need|want|hope|disappointed|excited)[^.!?]*[.!?])/gi,
        // Sentences with first person pronouns
        /([^.!?]*(?:I|me|my|we|our|us)\s+[^.!?]*[.!?])/gi,
        // Sentences that express problems or solutions
        /([^.!?]*(?:problem|issue|solution|feature|bug|works?|doesn't work|broken)[^.!?]*[.!?])/gi
      ];
      
      for (const pattern of sentencePatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(rawAnalysis)) !== null) {
          const text = match[1].trim();
          if (text.length > 30 && text.length < 300) {
            const normalizedQuote = this.normalizeQuote({
              text: text,
              category: 'sentence_extract',
              is_relevant: false, // Conservative default
              sentiment: 'neutral',
              theme: 'user_feedback'
            });
            quotes.push(normalizedQuote);
          }
        }
        
        if (quotes.length >= 5) break; // Limit to prevent spam
      }
    } catch (error) {
      // If regex fails, return empty array
    }
    
    return quotes.slice(0, 5); // Max 5 sentences
  }

  private static createUnstructuredFallback(rawAnalysis: string): ParsedQuote[] {
    // Always return at least one "quote" with the raw analysis
    const summary = rawAnalysis.length > 200 
      ? rawAnalysis.substring(0, 200) + '...'
      : rawAnalysis;
      
    return [this.normalizeQuote({
      text: `Raw analysis data: ${summary}`,
      category: 'unstructured',
      is_relevant: false,
      sentiment: 'neutral',
      theme: 'parsing_failed'
    })];
  }
}

class DatabaseService {
  static async insertPost(post: any, runId: string): Promise<{ success: boolean, error?: ProcessingError }> {
    try {
      const relevanceScore = AnalysisParser.extractRelevanceScore(post.raw_analysis);
      const classification = AnalysisParser.extractContentClassification(post.raw_analysis);
      
      const { error } = await getSupabaseClient()
        .from('posts')
        .upsert({
          post_id: post.post_id,
          subreddit: post.subreddit,
          url: post.url,
          title: post.title,
          body: post.body,
          comments: post.comments,
          created_utc: post.created_utc ? new Date(post.created_utc) : null,
          relevance_score: relevanceScore,
          classification_justification: classification,
          run_id: runId
        });

      if (error) {
        return {
          success: false,
          error: {
            type: 'post_insertion',
            message: `Failed to insert post ${post.post_id}`,
            details: error
          }
        };
      }
      
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: {
          type: 'post_insertion',
          message: `Post insertion exception for ${post.post_id}`,
          details: error.message
        }
      };
    }
  }

  static async insertQuotes(quotes: ParsedQuote[], postId: string, runId: string): Promise<{ success: boolean, quotesInserted: number, error?: ProcessingError }> {
    if (quotes.length === 0) {
      return { success: true, quotesInserted: 0 };
    }

    try {
      const quotesToInsert = quotes.map((quote) => ({
        quote_id: randomUUID(),
        post_id: postId,
        run_id: runId,
        text: quote.text,                                                    // REQUIRED
        category: quote.category || 'general',                              // Default if missing
        context: (quote.is_relevant !== false) ? 'relevant' : 'not_relevant', // Default to relevant
        sentiment: quote.sentiment || 'neutral',                            // Default if missing
        theme: quote.theme || 'general',                                    // Default if missing
        relevance_score: (quote.is_relevant !== false) ? 1.0 : 0.0         // Default to relevant
      }));

      const { error } = await getSupabaseClient()
        .from('quotes')
        .upsert(quotesToInsert);

      if (error) {
        return {
          success: false,
          quotesInserted: 0,
          error: {
            type: 'quote_insertion',
            message: `Failed to insert ${quotes.length} quotes for post ${postId}`,
            details: error
          }
        };
      }
      
      return { success: true, quotesInserted: quotes.length };
    } catch (error: any) {
      return {
        success: false,
        quotesInserted: 0,
        error: {
          type: 'quote_insertion',
          message: `Quote insertion exception for post ${postId}`,
          details: error.message
        }
      };
    }
  }

  static async updateRunStats(runId: string, stats: { posts: number, quotes: number, errors: number }) {
    const { error } = await getSupabaseClient()
      .from('runs')
      .update({
        posts_analyzed_count: stats.posts,
        quotes_extracted_count: stats.quotes,
        status: 'completed',
        end_time: new Date().toISOString(),
        error_message: stats.errors > 0 ? `${stats.errors} posts had parsing errors` : null
      })
      .eq('run_id', runId);

    if (error) {
      console.error('Error updating run stats:', error);
    }
  }
}

class PostProcessor {
  static async processPost(post: any, runId: string): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      success: false,
      postSaved: false,
      quotesCount: 0,
      errors: [],
      fallbacksUsed: []
    };

    // Step 1: Always try to save the post first (highest priority)
    const postResult = await DatabaseService.insertPost(post, runId);
    result.postSaved = postResult.success;
    
    if (!postResult.success) {
      result.errors.push(postResult.error!);
      // Even if post save fails, try to extract quotes for logging
    }

    // Step 2: Extract quotes with multi-layer fallback
    let quotesExtracted = { quotes: [] as ParsedQuote[], errors: [] as ProcessingError[], fallbacksUsed: [] as string[] };
    
    try {
      quotesExtracted = QuoteExtractor.extractAllQuotes(post.raw_analysis);
      result.fallbacksUsed.push(...quotesExtracted.fallbacksUsed);
      result.errors.push(...quotesExtracted.errors);
    } catch (error: any) {
      result.errors.push({
        type: 'quote_parsing',
        message: `Quote extraction completely failed for post ${post.post_id}`,
        details: error.message
      });
      
      // Create emergency fallback
      quotesExtracted.quotes = [{
        text: `Emergency fallback - failed to parse analysis for post ${post.post_id}`,
        category: 'system_error',
        is_relevant: false,
        sentiment: 'neutral',
        theme: 'extraction_failed'
      }];
      result.fallbacksUsed.push('emergency_fallback');
    }

    // Step 3: Try to save quotes (only if we have quotes and post was saved)
    if (quotesExtracted.quotes.length > 0 && result.postSaved) {
      const quotesResult = await DatabaseService.insertQuotes(quotesExtracted.quotes, post.post_id, runId);
      
      if (quotesResult.success) {
        result.quotesCount = quotesResult.quotesInserted;
      } else {
        result.errors.push(quotesResult.error!);
        // Post is saved but quotes failed - this is still partial success
      }
    }

    // Determine overall success
    // Success if post is saved (quotes are nice-to-have but not required)
    result.success = result.postSaved;

    return result;
  }
}

export async function POST(request: NextRequest) {
  // Initialize response with defaults - never return 500
  const response = {
    success: false,
    posts_processed: 0,
    posts_saved: 0,
    quotes_extracted: 0,
    total_errors: 0,
    run_id: '',
    processing_details: {
      fallbacks_used: [] as string[],
      error_breakdown: {} as Record<string, number>,
      partial_successes: 0
    },
    errors: [] as ProcessingError[]
  };

  try {
    const data: ProcessedPostData = await request.json();
    response.run_id = data.run_id;
    
    // Track detailed metrics
    let totalPostsSaved = 0;
    let totalQuotes = 0;
    let totalErrors = 0;
    let partialSuccesses = 0;
    const allFallbacks = new Set<string>();
    const errorBreakdown: Record<string, number> = {};
    const allErrors: ProcessingError[] = [];
    
    // Process each post with guaranteed non-failing approach
    for (const post of data.posts) {
      try {
        const result = await PostProcessor.processPost(post, data.run_id);
        
        // Track successes
        if (result.postSaved) {
          totalPostsSaved++;
        }
        
        totalQuotes += result.quotesCount;
        
        // Track fallbacks used
        result.fallbacksUsed.forEach(fallback => allFallbacks.add(fallback));
        
        // Track errors
        if (result.errors.length > 0) {
          totalErrors += result.errors.length;
          allErrors.push(...result.errors);
          
          // Count error types
          result.errors.forEach(error => {
            errorBreakdown[error.type] = (errorBreakdown[error.type] || 0) + 1;
          });
        }
        
        // Partial success: post saved but had some issues
        if (result.postSaved && result.errors.length > 0) {
          partialSuccesses++;
        }
        
      } catch (error: any) {
        // This should never happen with our graceful approach, but just in case
        totalErrors++;
        const fallbackError: ProcessingError = {
          type: 'validation',
          message: `Unexpected error processing post: ${error.message}`,
          details: post.post_id || 'unknown'
        };
        allErrors.push(fallbackError);
        errorBreakdown['validation'] = (errorBreakdown['validation'] || 0) + 1;
      }
    }

    // Update response with collected data
    response.posts_processed = data.posts.length;
    response.posts_saved = totalPostsSaved;
    response.quotes_extracted = totalQuotes;
    response.total_errors = totalErrors;
    response.processing_details.fallbacks_used = Array.from(allFallbacks);
    response.processing_details.error_breakdown = errorBreakdown;
    response.processing_details.partial_successes = partialSuccesses;
    response.errors = allErrors;

    // Determine overall success
    // Success if we saved at least some posts (even if not all)
    response.success = totalPostsSaved > 0;

    // Update run stats (this itself is non-critical)
    try {
      await DatabaseService.updateRunStats(data.run_id, {
        posts: totalPostsSaved,
        quotes: totalQuotes,
        errors: totalErrors
      });
    } catch (error) {
      // Run stats update failure is not critical - continue
      console.warn('Failed to update run stats:', error);
    }

    // Record metrics for monitoring
    ProcessingMonitor.recordRun({
      runId: data.run_id,
      totalPosts: data.posts.length,
      postsSaved: totalPostsSaved,
      quotesExtracted: totalQuotes,
      errors: allErrors,
      fallbacksUsed: Array.from(allFallbacks)
    });

    return NextResponse.json(response);

  } catch (error: any) {
    // Even catastrophic failures should return a proper response
    console.error('Critical processing error:', error);
    
    response.success = false;
    response.total_errors = 1;
    response.errors = [{
      type: 'validation',
      message: 'Critical system error during processing',
      details: error.message
    }];
    
    return NextResponse.json(response);
  }
}