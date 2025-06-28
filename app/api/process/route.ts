import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { ProcessingMonitor } from '../../../utils/processing-monitor'
import { getValidatedApiKey } from '../../../utils/api-key-validation'

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
  type: 'post_insertion' | 'quote_parsing' | 'quote_insertion' | 'validation' | 'ai_extraction'
  message: string
  details?: any
}

// OpenRouter client for intelligent quote extraction
class OpenRouterClient {
  private apiKey: string
  private baseURL = "https://openrouter.ai/api/v1"

  constructor() {
    this.apiKey = getValidatedApiKey('OPENROUTER_API_KEY') || ''
  }

  private validateApiKey() {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required')
    }
  }

  async extractQuotesIntelligently(rawAnalysis: string): Promise<ParsedQuote[]> {
    this.validateApiKey()
    
    const prompt = `Extract all user quotes from this Reddit analysis. Return ONLY a JSON array with this exact format:
[
  {
    "text": "exact quote text with no XML tags or metadata",
    "justification": "comprehensive reason why this quote was selected and its relevance",
    "sentiment": "positive/negative/neutral/frustrated",
    "theme": "main theme of the quote"
  }
]

RULES:
1. Only extract actual user statements, not analysis text or metadata
2. Remove any XML tags from quote text  
3. Ignore relevance scores and classification text
4. Each quote must be a complete user thought
5. No quotes starting with "<", ">", "relevance_score", "indicator", etc.
6. Justification should be 1-3 sentences explaining WHY this quote is valuable, its context, and relevance to user research
7. Return empty array if no valid quotes found

Analysis to process:
${rawAnalysis}`;

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://reddit-opportunity-engine.com',
          'X-Title': 'Reddit Opportunity Engine - Quote Extraction'
        },
        body: JSON.stringify({
          model: "openai/gpt-4.1-nano",
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2000,
          temperature: 0.1,
          stream: false
        })
      })

      if (!response.ok) {
        throw new Error(`OpenRouter API error ${response.status}: ${await response.text()}`)
      }

      const data = await response.json()
      const content = data.choices[0]?.message?.content

      if (!content) {
        throw new Error('Empty response from AI model')
      }

      // Extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error('No JSON array found in AI response')
      }

      const extractedQuotes = JSON.parse(jsonMatch[0])
      
      // Convert to ParsedQuote format
      return extractedQuotes.map((quote: any) => ({
        text: quote.text?.trim() || '',
        category: 'ai_extracted',
        is_relevant: true,
        sentiment: quote.sentiment || 'neutral',
        theme: quote.theme || 'general',
        justification: quote.justification || 'AI-extracted quote'
      })).filter((quote: ParsedQuote) => 
        quote.text.length > 10 && 
        !quote.text.includes('<') && 
        !quote.text.includes('>') &&
        !quote.text.startsWith('relevance_score') &&
        !quote.text.startsWith('indicator')
      )

    } catch (error: any) {
      console.error('Intelligent quote extraction failed:', error.message)
      throw new Error(`AI extraction failed: ${error.message}`)
    }
  }
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

  static generateRelevanceJustification(quote: ParsedQuote, relevanceScore: number, extractionMethod: string): string {
    const reasons = [];
    
    // Explain category selection
    const categoryExplanations = {
      'user_needs': 'Expresses a clear user need or pain point',
      'feature_signals': 'Indicates interest in specific product features',
      'user_language': 'Shows how users naturally describe their problems',
      'current_solutions': 'Discusses existing tools or workarounds',
      'general': 'Contains general relevant insights',
      'extracted_text': 'Extracted as potentially relevant text',
      'sentence_extract': 'Identified through sentence-level analysis',
      'unstructured': 'Captured through fallback extraction'
    };
    
    if (categoryExplanations[quote.category as keyof typeof categoryExplanations]) {
      reasons.push(categoryExplanations[quote.category as keyof typeof categoryExplanations]);
    }
    
    // Explain sentiment significance
    if (quote.sentiment === 'frustrated') {
      reasons.push('Strong emotional signal indicating significant pain point');
    } else if (quote.sentiment === 'excited') {
      reasons.push('Positive engagement suggesting market opportunity');
    } else if (quote.sentiment === 'negative') {
      reasons.push('Critical feedback providing improvement insights');
    } else if (quote.sentiment === 'positive') {
      reasons.push('Positive feedback indicating satisfaction or interest');
    }
    
    // Explain relevance based on score
    if (relevanceScore >= 8) {
      reasons.push('High relevance score indicates strong alignment with research goals');
    } else if (relevanceScore >= 6) {
      reasons.push('Moderate relevance score suggests useful insights');
    } else if (relevanceScore >= 4) {
      reasons.push('Baseline relevance with potential context value');
    }
    
    // Explain extraction quality
    if (extractionMethod === 'structured_xml') {
      reasons.push('High-quality structured extraction with complete metadata');
    } else if (extractionMethod === 'generic_extraction') {
      reasons.push('Standard extraction with good confidence level');
    } else if (extractionMethod === 'text_in_quotes') {
      reasons.push('Extracted from quoted text indicating user voice');
    }
    
    return reasons.length > 0 ? reasons.join('. ') + '.' : 'Selected based on content analysis algorithms.';
  }

  static analyzeQuestionAspects(quote: ParsedQuote, postAnalysis: string): string[] {
    const aspects = [];
    const text = quote.text.toLowerCase();
    const fullAnalysis = postAnalysis.toLowerCase();
    
    // Pricing-related aspects
    if (text.includes('price') || text.includes('cost') || text.includes('expensive') || 
        text.includes('cheap') || text.includes('budget') || text.includes('afford') ||
        text.includes('$') || text.includes('money') || text.includes('subscription')) {
      aspects.push('pricing');
    }
    
    // Feature-related aspects
    if (quote.category === 'feature_signals' || 
        text.includes('feature') || text.includes('functionality') || 
        text.includes('tool') || text.includes('need') || text.includes('want') ||
        text.includes('missing') || text.includes('integrate')) {
      aspects.push('features');
    }
    
    // User experience aspects
    if (text.includes('easy') || text.includes('difficult') || text.includes('confusing') || 
        text.includes('intuitive') || text.includes('simple') || text.includes('complex') ||
        text.includes('user-friendly') || text.includes('interface')) {
      aspects.push('user_experience');
    }
    
    // Competition/alternatives aspects
    if (text.includes('competitor') || text.includes('alternative') || text.includes('vs') ||
        text.includes('compared to') || text.includes('instead of') || text.includes('better than') ||
        quote.category === 'current_solutions') {
      aspects.push('competition');
    }
    
    // Pain points aspects
    if (quote.sentiment === 'frustrated' || quote.sentiment === 'negative' ||
        text.includes('problem') || text.includes('issue') || text.includes('pain') ||
        text.includes('struggle') || text.includes('hate') || text.includes('annoying')) {
      aspects.push('pain_points');
    }
    
    // User needs aspects
    if (quote.category === 'user_needs' || text.includes('need') || text.includes('require') ||
        text.includes('wish') || text.includes('hope') || text.includes('would like')) {
      aspects.push('user_needs');
    }
    
    // Performance/scalability aspects
    if (text.includes('slow') || text.includes('fast') || text.includes('performance') ||
        text.includes('scale') || text.includes('speed') || text.includes('lag')) {
      aspects.push('performance');
    }
    
    // Integration aspects
    if (text.includes('integrate') || text.includes('api') || text.includes('connect') ||
        text.includes('sync') || text.includes('import') || text.includes('export')) {
      aspects.push('integration');
    }
    
    // Support/documentation aspects
    if (text.includes('support') || text.includes('help') || text.includes('documentation') ||
        text.includes('tutorial') || text.includes('guide') || text.includes('learn')) {
      aspects.push('support');
    }
    
    // Workflow/productivity aspects
    if (text.includes('workflow') || text.includes('productivity') || text.includes('efficient') ||
        text.includes('save time') || text.includes('automation') || text.includes('process')) {
      aspects.push('workflow');
    }
    
    // If no specific aspects found, analyze the question relevance flag
    if (aspects.length === 0 && (quote as any).is_question_relevant) {
      aspects.push('general_relevance');
    }
    
    // Remove duplicates and return
    return [...new Set(aspects)];
  }

}

class QuoteExtractor {
  /**
   * Validate quote quality and reject malformed quotes
   */
  private static isValidQuote(quote: ParsedQuote): boolean {
    const text = quote.text.trim();
    
    // Check minimum content requirements
    if (text.length < 10) return false;
    
    // Reject quotes with XML syntax (but allow normal punctuation)
    if (text.includes('</') || text.includes('<quote') || text.includes('</quote>')) return false;
    
    // Only reject quotes that are obviously analysis metadata (more specific patterns)
    const metadataPatterns = [
      /^relevance_score:\s*/i,
      /^indicator:\s*/i,
      /^classification:\s*/i,
      /^\d+\s*-\s*(?:the post|this post|analysis)/i, // Pattern like "8 - The post discusses..."
      /^analysis shows/i,
      /^the post discusses/i,
      /^this content/i,
      /^category:\s*/i,
      /^sentiment:\s*/i
    ];
    
    if (metadataPatterns.some(pattern => pattern.test(text))) return false;
    
    // Much more lenient user validation - only reject obvious non-user content
    const hasUserIndicators = [
      /\b(i|my|me|we|our|us|you|your)\b/i,
      /\b(love|hate|frustrated|annoying|difficult|easy|wish|need|want|hope|think|feel|believe)\b/i,
      /\b(works?|doesn't work|broken|problem|issue|solution|always|never|literally)\b/i,
      /["'].*["']/,  // Contains quoted text
      /\$\d+/,       // Contains pricing
      /\w+\.\w+/,    // Contains domain/email-like patterns
      /\b(good|bad|terrible|great|awful|amazing|wrong|right)\b/i,
      /\b(app|software|system|tool|platform|website|service)\b/i
    ];
    
    // Only reject very short quotes without any user characteristics (likely metadata fragments)
    if (text.length < 25 && !hasUserIndicators.some(pattern => pattern.test(text))) {
      return false;
    }
    
    return true;
  }

  /**
   * Normalize a quote to ensure it has all required fields with sensible defaults
   */
  private static normalizeQuote(partialQuote: { text: string, [key: string]: any }): ParsedQuote {
    const quote = {
      text: partialQuote.text.trim(),
      category: partialQuote.category || 'general',
      is_relevant: partialQuote.is_relevant !== undefined ? partialQuote.is_relevant : true,
      sentiment: partialQuote.sentiment || 'neutral',
      theme: partialQuote.theme || 'general'
    };
    
    // Validate before returning
    if (!this.isValidQuote(quote)) {
      console.log(`❌ Rejected invalid quote: "${quote.text.substring(0, 100)}..."`);
      throw new Error('Invalid quote rejected');
    }
    
    return quote;
  }
  static extractQuotesFromSection(content: string, sectionName: string): Array<{text: string, is_question_relevant: boolean, sentiment: string, theme: string, justification?: string}> {
    const quotes: Array<{text: string, is_question_relevant: boolean, sentiment: string, theme: string, justification?: string}> = [];
    
    try {
      const sectionRegex = new RegExp(`<${sectionName}>([\\s\\S]*?)<\\/${sectionName}>`);
      const sectionMatch = content.match(sectionRegex);
      
      if (!sectionMatch) return quotes;
      
      const sectionContent = sectionMatch[1];
      
      // Enhanced pattern to capture sentiment, theme, and justification attributes
      const enhancedPattern = /<quote\s+is_question_relevant="(true|false)"\s+sentiment="([^"]*?)"\s+theme="([^"]*?)"\s+justification="([^"]*?)"[^>]*>(.*?)<\/quote>/g;
      const basicPattern = /<quote\s+is_question_relevant="(true|false)"\s+sentiment="([^"]*?)"\s+theme="([^"]*?)"[^>]*>(.*?)<\/quote>/g;
      const fallbackPattern = /<quote[^>]*>(.*?)<\/quote>/g;
      
      const patterns = [enhancedPattern, basicPattern, fallbackPattern];
      
      for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(sectionContent)) !== null) {
          let text, isRelevant, sentiment, theme, justification;
          
          if (pattern === enhancedPattern) {
            // Full attribute extraction with justification
            isRelevant = match[1] === 'true';
            sentiment = match[2] || 'neutral';
            theme = match[3] || 'general';
            justification = match[4] || undefined;
            text = match[5];
          } else if (pattern === basicPattern) {
            // Basic extraction without justification
            isRelevant = match[1] === 'true';
            sentiment = match[2] || 'neutral';
            theme = match[3] || 'general';
            justification = undefined;
            text = match[4];
          } else {
            // Fallback extraction
            isRelevant = true;
            sentiment = 'neutral';
            theme = 'general';
            justification = undefined;
            text = match[1];
          }
          
          text = this.cleanQuoteText(text);
          
          if (text.length > 10) {
            const quote: any = {
              text: text,
              is_question_relevant: isRelevant,
              sentiment: sentiment || 'neutral',
              theme: theme || 'general'
            };
            
            if (justification) {
              quote.justification = justification;
            }
            
            quotes.push(quote);
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

  static async extractAllQuotes(rawAnalysis: string): Promise<{ quotes: ParsedQuote[], errors: ProcessingError[], fallbacksUsed: string[] }> {
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
      
      // Fallback 2: Intelligent AI extraction (only when structured fails)
      result.fallbacksUsed.push('intelligent_ai_extraction');
      const aiQuotes = await this.extractWithIntelligentAI(rawAnalysis);
      if (aiQuotes.length > 0) {
        result.quotes = aiQuotes;
        return result;
      }
      
      // Fallback 3: Any text in quotes
      result.fallbacksUsed.push('text_in_quotes');
      const textQuotes = this.extractAnyQuotedText(rawAnalysis);
      if (textQuotes.length > 0) {
        result.quotes = textQuotes;
        return result;
      }
      
      // Fallback 4: Extract any sentences that look like user feedback
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
          try {
            const normalizedQuote = this.normalizeQuote({
              text: quote.text,
              category: section.category,
              is_relevant: quote.is_question_relevant,
              sentiment: quote.sentiment,
              theme: quote.theme
            });
            allQuotes.push(normalizedQuote);
          } catch (validationError) {
            // Quote was rejected by validation - log and continue
            console.log(`🔍 Quote validation rejected from ${section.name}: "${quote.text.substring(0, 50)}..."`);
          }
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
          try {
            const normalizedQuote = this.normalizeQuote({
              text: text,
              category: match[1],
              is_relevant: true,
              sentiment: match[2],
              theme: match[3]
            });
            quotes.push(normalizedQuote);
          } catch (validationError) {
            console.log(`🔍 Generic pattern quote rejected: "${text.substring(0, 50)}..."`);
          }
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
            try {
              const normalizedQuote = this.normalizeQuote({
                text: text,
                category: 'extracted_text',
                is_relevant: false,
                sentiment: 'neutral',
                theme: 'general'
              });
              quotes.push(normalizedQuote);
            } catch (validationError) {
              console.log(`🔍 Quoted text quote rejected: "${text.substring(0, 50)}..."`);
            }
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
            try {
              const normalizedQuote = this.normalizeQuote({
                text: text,
                category: 'sentence_extract',
                is_relevant: false, // Conservative default
                sentiment: 'neutral',
                theme: 'user_feedback'
              });
              quotes.push(normalizedQuote);
            } catch (validationError) {
              console.log(`🔍 Sentence extract quote rejected: "${text.substring(0, 50)}..."`);
            }
          }
        }
        
        if (quotes.length >= 5) break; // Limit to prevent spam
      }
    } catch (error) {
      // If regex fails, return empty array
    }
    
    return quotes.slice(0, 5); // Max 5 sentences
  }

  private static async extractWithIntelligentAI(rawAnalysis: string): Promise<ParsedQuote[]> {
    try {
      const openRouter = new OpenRouterClient();
      const aiQuotes = await openRouter.extractQuotesIntelligently(rawAnalysis);
      
      // Estimate cost (GPT-4.1-nano is ~$0.10 per 1M tokens, average request ~2000 tokens)
      const estimatedTokens = rawAnalysis.length / 3; // Rough token estimate
      const estimatedCost = (estimatedTokens / 1000000) * 0.10; // $0.10 per 1M tokens
      
      // Record AI extraction usage for monitoring
      ProcessingMonitor.recordAIExtraction({
        quotesExtracted: aiQuotes.length,
        estimatedCost: estimatedCost
      });
      
      console.log(`🤖 AI extracted ${aiQuotes.length} quotes from malformed output (est. cost: $${estimatedCost.toFixed(4)})`);
      return aiQuotes;
    } catch (error: any) {
      console.error('Intelligent AI extraction failed:', error.message);
      return [];
    }
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

class DataValidator {
  /**
   * Check if a value contains meaningful content (not null, undefined, empty, or whitespace-only)
   */
  static hasContent(value: any): boolean {
    return value !== null && value !== undefined && 
           typeof value === 'string' && value.trim().length > 0;
  }

  /**
   * Validate post data and log warnings for potentially problematic data
   */
  static validatePostData(post: any, postId: string): string[] {
    const warnings: string[] = [];
    
    if (!this.hasContent(post.title)) {
      warnings.push(`Post ${postId}: title is empty or null`);
    }
    
    if (!this.hasContent(post.body)) {
      warnings.push(`Post ${postId}: body is empty or null`);
    }
    
    if (!this.hasContent(post.comments)) {
      warnings.push(`Post ${postId}: comments is empty or null`);
    }
    
    if (!this.hasContent(post.url)) {
      warnings.push(`Post ${postId}: url is empty or null`);
    }
    
    if (!this.hasContent(post.subreddit)) {
      warnings.push(`Post ${postId}: subreddit is empty or null`);
    }
    
    // Check for suspiciously short content that might indicate extraction issues
    if (this.hasContent(post.title) && post.title.trim().length < 10) {
      warnings.push(`Post ${postId}: title suspiciously short (${post.title.length} chars)`);
    }
    
    if (this.hasContent(post.body) && post.body.trim().length < 20) {
      warnings.push(`Post ${postId}: body suspiciously short (${post.body.length} chars)`);
    }
    
    return warnings;
  }
}

class DatabaseService {
  static async insertPost(post: any, runId: string): Promise<{ success: boolean, error?: ProcessingError }> {
    try {
      // Validate incoming post data and log warnings
      const validationWarnings = DataValidator.validatePostData(post, post.post_id);
      if (validationWarnings.length > 0) {
        console.warn(`⚠️ Data validation warnings for post ${post.post_id}:`, validationWarnings);
      }

      const relevanceScore = AnalysisParser.extractRelevanceScore(post.raw_analysis);
      const classification = AnalysisParser.extractContentClassification(post.raw_analysis);
      
      // First, check if this post already exists to avoid overwriting good data with empty values
      const { data: existingPost } = await getSupabaseClient()
        .from('posts')
        .select('post_id, title, body, comments')
        .eq('post_id', post.post_id)
        .single();

      // Build the update object, preserving existing data when new data is empty/null
      const updateData: any = {
        post_id: post.post_id,
        subreddit: post.subreddit || null,
        url: post.url || null,
        relevance_score: relevanceScore,
        classification_justification: classification,
        run_id: runId,
        created_utc: post.created_utc ? new Date(post.created_utc) : null
      };

      // Smart field updates: only overwrite if we have actual content
      if (existingPost) {
        // Track data preservation for monitoring
        const fieldsPreserved: string[] = [];
        const willOverwrite: string[] = [];
        
        // Title: keep existing if new is empty/null, otherwise update
        if (DataValidator.hasContent(post.title)) {
          updateData.title = post.title;
          if (DataValidator.hasContent(existingPost.title) && existingPost.title !== post.title) {
            willOverwrite.push(`title: "${existingPost.title}" -> "${post.title}"`);
          }
        } else if (DataValidator.hasContent(existingPost.title)) {
          updateData.title = existingPost.title; // Preserve existing
          fieldsPreserved.push('title');
          console.log(`📋 Preserving existing title for post ${post.post_id}: "${existingPost.title}"`);
        } else {
          updateData.title = post.title || null;
        }

        // Body: keep existing if new is empty/null, otherwise update  
        if (DataValidator.hasContent(post.body)) {
          updateData.body = post.body;
          if (DataValidator.hasContent(existingPost.body) && existingPost.body !== post.body) {
            willOverwrite.push(`body: "${existingPost.body.substring(0, 50)}..." -> "${post.body.substring(0, 50)}..."`);
          }
        } else if (DataValidator.hasContent(existingPost.body)) {
          updateData.body = existingPost.body; // Preserve existing
          fieldsPreserved.push('body');
          console.log(`📋 Preserving existing body for post ${post.post_id} (${existingPost.body.length} chars)`);
        } else {
          updateData.body = post.body || null;
        }

        // Comments: keep existing if new is empty/null, otherwise update
        if (DataValidator.hasContent(post.comments)) {
          updateData.comments = post.comments;
          if (DataValidator.hasContent(existingPost.comments) && existingPost.comments !== post.comments) {
            willOverwrite.push(`comments: "${existingPost.comments.substring(0, 50)}..." -> "${post.comments.substring(0, 50)}..."`);
          }
        } else if (DataValidator.hasContent(existingPost.comments)) {
          updateData.comments = existingPost.comments; // Preserve existing
          fieldsPreserved.push('comments');
          console.log(`📋 Preserving existing comments for post ${post.post_id} (${existingPost.comments.length} chars)`);
        } else {
          updateData.comments = post.comments || null;
        }

        // Record data preservation metrics
        if (fieldsPreserved.length > 0 || willOverwrite.length > 0) {
          ProcessingMonitor.recordDataPreservation({
            postId: post.post_id,
            fieldsPreserved,
            wasOverwrite: willOverwrite.length > 0
          });
        }

        // Log overwrites for debugging
        if (willOverwrite.length > 0) {
          console.log(`🔄 Post ${post.post_id} data changes:`, willOverwrite);
        }
      } else {
        // New post - use all provided data
        updateData.title = post.title || null;
        updateData.body = post.body || null;
        updateData.comments = post.comments || null;
      }

      const { error } = await getSupabaseClient()
        .from('posts')
        .upsert(updateData);

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

  static async insertQuotes(quotes: ParsedQuote[], postId: string, runId: string, postRelevanceScore: number = 5, extractionMethod: string = 'unknown', postAnalysis: string = ''): Promise<{ success: boolean, quotesInserted: number, error?: ProcessingError }> {
    if (quotes.length === 0) {
      return { success: true, quotesInserted: 0 };
    }

    try {
      // Convert AI relevance score (0-10) to database format (0.0-1.0)
      const normalizedRelevanceScore = Math.max(0.0, Math.min(1.0, postRelevanceScore / 10.0));

      const quotesToInsert = quotes.map((quote) => {
        // Use AI-provided justification if available, otherwise generate a comprehensive one
        const justification = (quote as any).justification || 
          `${AnalysisParser.generateRelevanceJustification(quote, postRelevanceScore, extractionMethod)} Extracted using ${extractionMethod} method.`;
        
        return {
          quote_id: randomUUID(),
          post_id: postId,
          run_id: runId,
          text: quote.text,                                                    // REQUIRED
          category: quote.category || 'general',                              // Default if missing
          context: (quote.is_relevant !== false) ? 'relevant' : 'not_relevant', // Default to relevant
          sentiment: quote.sentiment || 'neutral',                            // Default if missing
          theme: quote.theme || 'general',                                    // Default if missing
          relevance_score: normalizedRelevanceScore,                          // Inherit from post's AI relevance score
          relevance_justification: justification                              // Comprehensive justification including context
        };
      });

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

    // Step 1: Extract relevance score from AI analysis (used for both post and quotes)
    const postRelevanceScore = AnalysisParser.extractRelevanceScore(post.raw_analysis);

    // Step 2: Always try to save the post first (highest priority)
    const postResult = await DatabaseService.insertPost(post, runId);
    result.postSaved = postResult.success;
    
    if (!postResult.success) {
      result.errors.push(postResult.error!);
      // Even if post save fails, try to extract quotes for logging
    }

    // Step 3: Extract quotes with multi-layer fallback
    let quotesExtracted = { quotes: [] as ParsedQuote[], errors: [] as ProcessingError[], fallbacksUsed: [] as string[] };
    
    try {
      quotesExtracted = await QuoteExtractor.extractAllQuotes(post.raw_analysis);
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

    // Step 4: Try to save quotes (only if we have quotes and post was saved)
    if (quotesExtracted.quotes.length > 0 && result.postSaved) {
      // Determine the primary extraction method used
      const extractionMethod = quotesExtracted.fallbacksUsed.length > 0 
        ? quotesExtracted.fallbacksUsed[0] 
        : 'structured_xml';
        
      const quotesResult = await DatabaseService.insertQuotes(quotesExtracted.quotes, post.post_id, runId, postRelevanceScore, extractionMethod, post.raw_analysis);
      
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
    
    // Validate data structure
    if (!data.posts || !Array.isArray(data.posts)) {
      console.error('❌ Invalid data structure received:', {
        hasRunId: !!data.run_id,
        postsType: typeof data.posts,
        postsIsArray: Array.isArray(data.posts),
        dataKeys: Object.keys(data),
        postsValue: data.posts
      });
      throw new Error(`Invalid posts data: expected array, got ${typeof data.posts}`);
    }
    
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