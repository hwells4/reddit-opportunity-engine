import { SearchPost } from '../../app/api/search/types';

export class PostProcessor {
  private static readonly TRUNCATE_LENGTH = 2000; // FR-3 requirement
  private static readonly SNIPPET_LENGTH = 200;
  
  /**
   * Process and clean a batch of posts
   * FR-3: Truncate text, strip markup, clean formatting
   */
  static processPosts(posts: SearchPost[]): SearchPost[] {
    return posts.map(post => this.processPost(post));
  }
  
  /**
   * Process a single post
   */
  static processPost(post: SearchPost): SearchPost {
    return {
      ...post,
      title: this.cleanText(post.title),
      snippet: this.createSnippet(post.selfText || post.snippet),
      selfText: this.truncateText(this.cleanText(post.selfText || ''))
    };
  }
  
  /**
   * Clean text by removing markdown and formatting
   */
  private static cleanText(text: string): string {
    if (!text) return '';
    
    return text
      // Remove URLs but keep the text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove image/video embeds
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '[code removed]')
      .replace(/`([^`]+)`/g, '$1')
      // Remove formatting characters
      .replace(/(\*\*|__)(.*?)\1/g, '$2') // Bold
      .replace(/(\*|_)(.*?)\1/g, '$2') // Italic
      .replace(/~~(.*?)~~/g, '$1') // Strikethrough
      // Remove headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove quotes
      .replace(/^>\s+/gm, '')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}$/gm, '')
      // Remove Reddit-specific formatting
      .replace(/\/[ur]\/[A-Za-z0-9_]+/g, (match) => match) // Keep user/sub mentions
      .replace(/\^\^/g, '') // Remove superscript markers
      // Clean up whitespace
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }
  
  /**
   * Truncate text to specified length
   */
  private static truncateText(text: string, maxLength: number = this.TRUNCATE_LENGTH): string {
    if (text.length <= maxLength) {
      return text;
    }
    
    // Try to break at a sentence boundary
    const truncated = text.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclamation = truncated.lastIndexOf('!');
    
    const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);
    
    if (lastSentenceEnd > maxLength * 0.8) {
      return truncated.substring(0, lastSentenceEnd + 1).trim();
    }
    
    // Otherwise break at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.9) {
      return truncated.substring(0, lastSpace).trim() + '...';
    }
    
    return truncated.trim() + '...';
  }
  
  /**
   * Create a snippet for display
   */
  private static createSnippet(text: string): string {
    const cleaned = this.cleanText(text);
    
    if (!cleaned) {
      return '';
    }
    
    // Try to get the first meaningful paragraph
    const paragraphs = cleaned.split(/\n\n+/);
    const firstParagraph = paragraphs.find(p => p.length > 50) || paragraphs[0] || '';
    
    return this.truncateText(firstParagraph, this.SNIPPET_LENGTH);
  }
  
  /**
   * Extract key terms from posts for analysis
   */
  static extractKeyTerms(posts: SearchPost[]): Map<string, number> {
    const termFrequency = new Map<string, number>();
    const stopWords = new Set([
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
      'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
      'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
      'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
      'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
      'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
      'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
      'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over'
    ]);
    
    for (const post of posts) {
      const text = `${post.title} ${post.selfText || ''}`.toLowerCase();
      const words = text.match(/\b[a-z]+\b/g) || [];
      
      for (const word of words) {
        if (word.length > 3 && !stopWords.has(word)) {
          termFrequency.set(word, (termFrequency.get(word) || 0) + 1);
        }
      }
    }
    
    // Sort by frequency and return top terms
    return new Map(
      [...termFrequency.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
    );
  }
}