import { SearchPost } from '../../app/api/search/types';
import { getValidatedApiKey } from '../../utils/api-key-validation';

export interface EmbeddingOptions {
  provider: 'openai' | 'miniLM' | 'bge';
  questions: string[];
  maxPosts: number;
  oversampleFactor?: number;
  truncateLength?: number;
}

export interface EmbeddingResult {
  posts: SearchPost[];
  stats: {
    inputPosts: number;
    outputPosts: number;
    embeddingCalls: number;
    tokensUsed: number;
    cost: number;
  };
}

interface EmbeddingVector {
  postId: string;
  vector: number[];
}

export class EmbeddingPrune {
  private static readonly BATCH_SIZE = 512; // FR-4: Max texts per batch
  private static readonly DEFAULT_OVERSAMPLE = 3;
  private static readonly DEFAULT_TRUNCATE = 2000;
  private static readonly OPENAI_EMBED_MODEL = 'text-embedding-3-small';
  // private static readonly OPENAI_EMBED_DIM = 1536; // Reserved for future use
  
  private apiKey?: string;
  
  constructor() {
    this.apiKey = getValidatedApiKey('OPENAI_API_KEY') || undefined;
  }
  
  /**
   * Prune posts using embeddings and cosine similarity
   * FR-4: Batch ≤512 texts, cosine similarity vs averaged query vector
   */
  async prunePosts(posts: SearchPost[], options: EmbeddingOptions): Promise<EmbeddingResult> {
    const stats = {
      inputPosts: posts.length,
      outputPosts: 0,
      embeddingCalls: 0,
      tokensUsed: 0,
      cost: 0
    };
    
    if (posts.length === 0) {
      return { posts: [], stats };
    }
    
    // Calculate target post count
    const oversampleFactor = options.oversampleFactor || EmbeddingPrune.DEFAULT_OVERSAMPLE;
    const targetCount = Math.min(
      options.maxPosts * oversampleFactor,
      posts.length
    );
    
    try {
      // Get embeddings based on provider
      let embeddings: EmbeddingVector[];
      let queryEmbedding: number[];
      
      switch (options.provider) {
        case 'openai':
          if (!this.apiKey) {
            console.warn('OpenAI API key not available, falling back to random sampling');
            return this.randomSample(posts, targetCount, stats);
          }
          ({ embeddings, queryEmbedding } = await this.getOpenAIEmbeddings(posts, options, stats));
          break;
          
        case 'miniLM':
        case 'bge':
          // For now, fall back to random sampling for local models
          // TODO: Implement local model support with transformers.js or ONNX
          console.log(`Local model ${options.provider} not yet implemented, using random sampling`);
          return this.randomSample(posts, targetCount, stats);
          
        default:
          throw new Error(`Unknown embedding provider: ${options.provider}`);
      }
      
      // Calculate cosine similarities
      const similarities = this.calculateSimilarities(embeddings, queryEmbedding);
      
      // Log similarity distribution
      const sortedSimilarities = similarities.sort((a, b) => b.similarity - a.similarity);
      console.log(`[EmbeddingPrune] Similarity scores distribution:`);
      console.log(`  Top 5: ${sortedSimilarities.slice(0, 5).map(s => s.similarity.toFixed(3)).join(', ')}`);
      console.log(`  Bottom 5: ${sortedSimilarities.slice(-5).map(s => s.similarity.toFixed(3)).join(', ')}`);
      console.log(`  Keeping top ${targetCount} out of ${similarities.length} posts`);
      
      // Sort by similarity and take top N
      const sortedPosts = sortedSimilarities
        .slice(0, targetCount)
        .map(item => posts.find(p => p.id === item.postId)!)
        .filter(Boolean);
      
      stats.outputPosts = sortedPosts.length;
      
      return {
        posts: sortedPosts,
        stats
      };
      
    } catch (error) {
      console.error('Embedding prune error:', error);
      // Fall back to random sampling on error
      return this.randomSample(posts, targetCount, stats);
    }
  }
  
  /**
   * Get embeddings using OpenAI API
   */
  private async getOpenAIEmbeddings(
    posts: SearchPost[],
    options: EmbeddingOptions,
    stats: { embeddingCalls: number; tokensUsed: number; cost: number }
  ): Promise<{ embeddings: EmbeddingVector[]; queryEmbedding: number[] }> {
    const embeddings: EmbeddingVector[] = [];
    
    // First, get query embedding
    const queryText = options.questions.join(' ');
    const queryEmbedding = await this.getOpenAIEmbedding(queryText, stats);
    
    // Process posts in batches
    const texts = posts.map(post => this.prepareTextForEmbedding(post, options.truncateLength));
    
    for (let i = 0; i < texts.length; i += EmbeddingPrune.BATCH_SIZE) {
      const batch = texts.slice(i, i + EmbeddingPrune.BATCH_SIZE);
      const batchPosts = posts.slice(i, i + EmbeddingPrune.BATCH_SIZE);
      
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: EmbeddingPrune.OPENAI_EMBED_MODEL,
            input: batch,
            encoding_format: 'float'
          })
        });
        
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`OpenAI API error ${response.status}: ${error}`);
        }
        
        const data = await response.json();
        stats.embeddingCalls++;
        stats.tokensUsed += data.usage?.total_tokens || 0;
        
        // Map embeddings to post IDs
        data.data.forEach((item: any, index: number) => {
          embeddings.push({
            postId: batchPosts[index].id,
            vector: item.embedding
          });
        });
        
      } catch (error) {
        console.error(`Batch embedding error:`, error);
        // Skip this batch on error
      }
    }
    
    // Calculate cost (text-embedding-3-small: $0.00002 per 1K tokens)
    stats.cost = (stats.tokensUsed / 1000) * 0.00002;
    
    return { embeddings, queryEmbedding };
  }
  
  /**
   * Get single embedding from OpenAI
   */
  private async getOpenAIEmbedding(text: string, stats: any): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EmbeddingPrune.OPENAI_EMBED_MODEL,
        input: text,
        encoding_format: 'float'
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${error}`);
    }
    
    const data = await response.json();
    stats.embeddingCalls++;
    stats.tokensUsed += data.usage?.total_tokens || 0;
    
    return data.data[0].embedding;
  }
  
  /**
   * Prepare text for embedding
   */
  private prepareTextForEmbedding(post: SearchPost, maxLength?: number): string {
    const truncateLength = maxLength || EmbeddingPrune.DEFAULT_TRUNCATE;
    const text = `${post.title} ${post.selfText || post.snippet || ''}`;
    
    if (text.length <= truncateLength) {
      return text;
    }
    
    return text.substring(0, truncateLength);
  }
  
  /**
   * Calculate cosine similarities between post embeddings and query
   */
  private calculateSimilarities(
    embeddings: EmbeddingVector[],
    queryVector: number[]
  ): Array<{ postId: string; similarity: number }> {
    return embeddings.map(embedding => ({
      postId: embedding.postId,
      similarity: this.cosineSimilarity(embedding.vector, queryVector)
    }));
  }
  
  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimension');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (normA * normB);
  }
  
  /**
   * Fallback: Random sampling when embeddings not available
   */
  private randomSample(posts: SearchPost[], count: number, stats: any): EmbeddingResult {
    // Shuffle array using Fisher-Yates
    const shuffled = [...posts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    const sampled = shuffled.slice(0, count);
    stats.outputPosts = sampled.length;
    
    return {
      posts: sampled,
      stats
    };
  }
  
  /**
   * Calculate average of multiple vectors (for multi-question queries)
   * Reserved for future enhancement where we embed each question separately
   */
  // private averageVectors(vectors: number[][]): number[] {
  //   if (vectors.length === 0) return [];
  //   
  //   const dimension = vectors[0].length;
  //   const result = new Array(dimension).fill(0);
  //   
  //   for (const vector of vectors) {
  //     for (let i = 0; i < dimension; i++) {
  //       result[i] += vector[i];
  //     }
  //   }
  //   
  //   return result.map(val => val / vectors.length);
  // }
}