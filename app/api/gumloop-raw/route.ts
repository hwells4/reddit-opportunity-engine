import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface RawGumloopData {
  run_id: string
  posts: Array<{
    post_id: string
    subreddit: string
    url: string
    title: string
    body: string
    comments?: string
    created_utc?: string
    raw_analysis: string  // The XML output from AI
  }>
}

// Server-side parsing functions
function extractRelevanceScore(content: string): number {
  try {
    // Try primary pattern
    let match = content.match(/<relevance_score>(\d+)/);
    if (match) return parseInt(match[1]);
    
    // Fallback patterns
    match = content.match(/^(\d+)/);
    if (match) return parseInt(match[1]);
    
    match = content.match(/score:?\s*(\d+)/i);
    if (match) return parseInt(match[1]);
    
    return 5; // Default score
  } catch {
    return 5;
  }
}

function extractQuestionFlag(content: string): boolean {
  try {
    const match = content.match(/<question_relevance_flag>(TRUE|FALSE)/);
    return match ? match[1] === 'TRUE' : true; // Default to true
  } catch {
    return true;
  }
}

function extractContentClassification(content: string): string {
  try {
    const match = content.match(/<content_classification>([\s\S]*?)<\/content_classification>/);
    return match ? match[1].trim() : 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

function extractQuotesFromSection(content: string, sectionName: string): Array<{text: string, is_question_relevant: boolean}> {
  const quotes: Array<{text: string, is_question_relevant: boolean}> = [];
  
  try {
    // Find the section
    const sectionRegex = new RegExp(`<${sectionName}>([\\s\\S]*?)<\\/${sectionName}>`);
    const sectionMatch = content.match(sectionRegex);
    
    if (!sectionMatch) return quotes;
    
    const sectionContent = sectionMatch[1];
    
    // Extract quotes with multiple fallback patterns
    const patterns = [
      /<quote is_question_relevant="(true|false)">(.*?)<\/quote>/g,
      /<quote[^>]*>(.*?)<\/quote>/g,  // Quotes without attributes
      /"([^"]+)"/g  // Simple quoted text
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(sectionContent)) !== null) {
        let text = match[2] || match[1];
        let isRelevant = match[1] === 'true' || true; // Default to true
        
        // Clean up post ID prefixes
        text = text.replace(/^[A-Za-z]+-[A-Za-z0-9]+:\s*/, '').trim();
        text = text.replace(/^["']|["']$/g, ''); // Remove quotes
        
        if (text.length > 10) { // Only keep substantial quotes
          quotes.push({
            text: text,
            is_question_relevant: isRelevant
          });
        }
      }
      
      if (quotes.length > 0) break; // Stop if we found quotes with this pattern
    }
    
  } catch (error) {
    console.error(`Error extracting ${sectionName}:`, error);
  }
  
  return quotes;
}

export async function POST(request: NextRequest) {
  try {
    const data: RawGumloopData = await request.json()
    
    let totalPosts = 0
    let totalQuotes = 0
    let parseErrors = 0
    
    for (const post of data.posts) {
      try {
        // Parse the raw XML with robust error handling
        const relevanceScore = extractRelevanceScore(post.raw_analysis)
        const questionFlag = extractQuestionFlag(post.raw_analysis)
        const classification = extractContentClassification(post.raw_analysis)
        
        // Insert post
        const { error: postError } = await supabase
          .from('posts')
          .insert({
            post_id: post.post_id,
            subreddit: post.subreddit,
            url: post.url,
            title: post.title,
            body: post.body,
            comments: post.comments,
            created_utc: post.created_utc ? new Date(post.created_utc) : null,
            relevance_score: relevanceScore,
            classification_justification: classification,
            run_id: data.run_id
          })

        if (postError) {
          console.error('Error inserting post:', postError)
          continue
        }
        
        totalPosts++

        // Extract quotes from all sections
        const allQuotes: Array<{ text: string; category: string; is_relevant: boolean }> = []
        
        // Try to extract from each section, but don't fail if some are missing
        const sections = [
          { name: 'user_needs', category: 'user_needs' },
          { name: 'user_language', category: 'user_language' },
          { name: 'current_solutions', category: 'current_solutions' },
          { name: 'feature_signals', category: 'feature_signals' }
        ]
        
        for (const section of sections) {
          const sectionQuotes = extractQuotesFromSection(post.raw_analysis, section.name)
          sectionQuotes.forEach(quote => {
            allQuotes.push({
              text: quote.text,
              category: section.category,
              is_relevant: quote.is_question_relevant
            })
          })
        }

        // Insert quotes with deterministic IDs
        if (allQuotes.length > 0) {
          const quotesToInsert = allQuotes.map((quote, index) => ({
            quote_id: `${post.post_id}_quote_${index.toString().padStart(3, '0')}`,
            post_id: post.post_id,
            run_id: data.run_id,
            text: quote.text,
            category: quote.category,
            context: quote.is_relevant ? 'relevant' : 'not_relevant',
            relevance_score: quote.is_relevant ? 1.0 : 0.0
          }))

          const { error: quotesError } = await supabase
            .from('quotes')
            .insert(quotesToInsert)

          if (quotesError) {
            console.error('Error inserting quotes:', quotesError)
          } else {
            totalQuotes += allQuotes.length
          }
        }
        
      } catch (parseError) {
        console.error(`Parse error for post ${post.post_id}:`, parseError)
        parseErrors++
        // Continue processing other posts
      }
    }

    // Update run statistics
    const { error: updateError } = await supabase
      .from('runs')
      .update({
        posts_analyzed_count: totalPosts,
        quotes_extracted_count: totalQuotes,
        status: parseErrors > 0 ? 'completed_with_errors' : 'completed',
        end_time: new Date().toISOString(),
        error_message: parseErrors > 0 ? `${parseErrors} posts had parsing errors` : null
      })
      .eq('run_id', data.run_id)

    if (updateError) {
      console.error('Error updating run stats:', updateError)
    }

    return NextResponse.json({
      success: true,
      posts_processed: totalPosts,
      quotes_extracted: totalQuotes,
      parse_errors: parseErrors,
      run_id: data.run_id
    })

  } catch (error) {
    console.error('Gumloop raw data processing error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 