import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

// Validate environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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
  text: string
  category: string
  is_relevant: boolean
}

interface ProcessingResult {
  posts_processed: number
  quotes_extracted: number
  parse_errors: number
  run_id: string
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
  static extractQuotesFromSection(content: string, sectionName: string): Array<{text: string, is_question_relevant: boolean}> {
    const quotes: Array<{text: string, is_question_relevant: boolean}> = [];
    
    try {
      const sectionRegex = new RegExp(`<${sectionName}>([\\s\\S]*?)<\\/${sectionName}>`);
      const sectionMatch = content.match(sectionRegex);
      
      if (!sectionMatch) return quotes;
      
      const sectionContent = sectionMatch[1];
      
      const patterns = [
        /<quote is_question_relevant="(true|false)">(.*?)<\/quote>/g,
        /<quote[^>]*>(.*?)<\/quote>/g,
        /"([^"]+)"/g
      ];
      
      for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(sectionContent)) !== null) {
          let text = match[2] || match[1];
          let isRelevant = match[1] === 'true' || true;
          
          text = this.cleanQuoteText(text);
          
          if (text.length > 10) {
            quotes.push({
              text: text,
              is_question_relevant: isRelevant
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

  static extractAllQuotes(rawAnalysis: string): ParsedQuote[] {
    const allQuotes: ParsedQuote[] = [];
    
    const sections = [
      { name: 'user_needs', category: 'user_needs' },
      { name: 'user_language', category: 'user_language' },
      { name: 'current_solutions', category: 'current_solutions' },
      { name: 'feature_signals', category: 'feature_signals' }
    ];
    
    for (const section of sections) {
      const sectionQuotes = this.extractQuotesFromSection(rawAnalysis, section.name);
      sectionQuotes.forEach(quote => {
        allQuotes.push({
          text: quote.text,
          category: section.category,
          is_relevant: quote.is_question_relevant
        });
      });
    }
    
    return allQuotes;
  }
}

class DatabaseService {
  static async insertPost(post: any, runId: string) {
    const relevanceScore = AnalysisParser.extractRelevanceScore(post.raw_analysis);
    const classification = AnalysisParser.extractContentClassification(post.raw_analysis);
    
    const { error } = await supabase
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
      console.error('Error inserting post:', error);
      throw error;
    }
  }

  static async insertQuotes(quotes: ParsedQuote[], postId: string, runId: string) {
    if (quotes.length === 0) return 0;

    const quotesToInsert = quotes.map((quote, index) => ({
      quote_id: randomUUID(),
      post_id: postId,
      run_id: runId,
      text: quote.text,
      category: quote.category,
      context: quote.is_relevant ? 'relevant' : 'not_relevant',
      relevance_score: quote.is_relevant ? 1.0 : 0.0
    }));

    const { error } = await supabase
      .from('quotes')
      .upsert(quotesToInsert);

    if (error) {
      console.error('Error inserting quotes:', error);
      throw error;
    }
    return quotes.length;
  }

  static async updateRunStats(runId: string, stats: { posts: number, quotes: number, errors: number }) {
    const { error } = await supabase
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
  static async processPost(post: any, runId: string): Promise<{ success: boolean, quotesCount: number }> {
    try {
      await DatabaseService.insertPost(post, runId);
      
      const quotes = QuoteExtractor.extractAllQuotes(post.raw_analysis);
      const quotesCount = await DatabaseService.insertQuotes(quotes, post.post_id, runId);
      
      return { success: true, quotesCount };
    } catch (error) {
      console.error(`Error processing post ${post.post_id}:`, error);
      return { success: false, quotesCount: 0 };
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const data: ProcessedPostData = await request.json();
    
    let totalPosts = 0;
    let totalQuotes = 0;
    let parseErrors = 0;
    
    for (const post of data.posts) {
      const result = await PostProcessor.processPost(post, data.run_id);
      
      if (result.success) {
        totalPosts++;
        totalQuotes += result.quotesCount;
      } else {
        parseErrors++;
      }
    }

    await DatabaseService.updateRunStats(data.run_id, {
      posts: totalPosts,
      quotes: totalQuotes,
      errors: parseErrors
    });

    return NextResponse.json({
      success: true,
      posts_processed: totalPosts,
      quotes_extracted: totalQuotes,
      parse_errors: parseErrors,
      run_id: data.run_id
    });

  } catch (error) {
    console.error('Post processing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}