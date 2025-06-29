import { createClient } from '@supabase/supabase-js';
import { SearchPost } from '../../app/api/search/types';
import { CostBreakdown } from './cost-meter';

function getSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export interface SearchRunData {
  runId: string;
  searchParams: any;
  stats: any;
  costBreakdown: CostBreakdown;
  accountId?: string;
}

export class SearchDatabase {
  private supabase = getSupabaseClient();
  
  /**
   * Create a new search run record
   */
  async createSearchRun(data: {
    runId: string;
    searchParams: any;
    accountId?: string;
  }): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('search_runs')
        .insert({
          run_id: data.runId,
          search_params: data.searchParams,
          account_id: data.accountId
        });
      
      if (error) {
        console.error('Error creating search run:', error);
        return { success: false, error };
      }
      
      return { success: true };
    } catch (error) {
      console.error('Exception creating search run:', error);
      return { success: false, error };
    }
  }
  
  /**
   * Update search run with completion data
   */
  async completeSearchRun(
    runId: string,
    stats: any,
    costBreakdown: CostBreakdown
  ): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('search_runs')
        .update({
          completed_at: new Date().toISOString(),
          stats,
          cost_breakdown: costBreakdown
        })
        .eq('run_id', runId);
      
      if (error) {
        console.error('Error updating search run:', error);
        return { success: false, error };
      }
      
      return { success: true };
    } catch (error) {
      console.error('Exception updating search run:', error);
      return { success: false, error };
    }
  }
  
  /**
   * Save search posts to database
   * FR-9: Link posts to run if X-Subtext-Run header present
   */
  async savePosts(
    posts: SearchPost[],
    runId?: string
  ): Promise<{ success: boolean; saved: number; errors: number }> {
    let saved = 0;
    let errors = 0;
    
    // Process in batches to avoid overwhelming the database
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE);
      
      try {
        const postsToInsert = batch.map(post => ({
          post_id: post.id,
          run_id: runId || null,
          subreddit: post.subreddit,
          title: post.title,
          body: post.selfText,
          snippet: post.snippet,
          score: post.score,
          created_utc: post.createdUtc,
          url: post.url,
          // Vector will be null unless storeVectors=true
          vector: null
        }));
        
        const { error } = await this.supabase
          .from('posts')
          .upsert(postsToInsert, {
            onConflict: 'post_id',
            ignoreDuplicates: false // Update if exists
          });
        
        if (error) {
          console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, error);
          errors += batch.length;
        } else {
          saved += batch.length;
        }
      } catch (error) {
        console.error(`Exception processing batch ${i / BATCH_SIZE + 1}:`, error);
        errors += batch.length;
      }
    }
    
    return {
      success: errors === 0,
      saved,
      errors
    };
  }
  
  /**
   * Store post embeddings (future feature)
   */
  async storeEmbeddings(
    embeddings: Array<{ postId: string; vector: number[] }>
  ): Promise<{ success: boolean; error?: any }> {
    try {
      // Update posts with their embedding vectors
      for (const { postId, vector } of embeddings) {
        const { error } = await this.supabase
          .from('posts')
          .update({ vector })
          .eq('post_id', postId);
        
        if (error) {
          console.error(`Error storing embedding for post ${postId}:`, error);
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('Exception storing embeddings:', error);
      return { success: false, error };
    }
  }
  
  /**
   * Get search run statistics
   */
  async getSearchRunStats(accountId?: string): Promise<{
    totalRuns: number;
    totalCost: number;
    avgPostsPerRun: number;
    recentRuns: any[];
  }> {
    try {
      let query = this.supabase
        .from('search_runs')
        .select('*');
      
      if (accountId) {
        query = query.eq('account_id', accountId);
      }
      
      const { data: runs, error } = await query
        .order('started_at', { ascending: false })
        .limit(100);
      
      if (error || !runs) {
        console.error('Error fetching search runs:', error);
        return {
          totalRuns: 0,
          totalCost: 0,
          avgPostsPerRun: 0,
          recentRuns: []
        };
      }
      
      const totalRuns = runs.length;
      const totalCost = runs.reduce((sum, run) => 
        sum + (run.cost_breakdown?.total || 0), 0
      );
      const totalPosts = runs.reduce((sum, run) => 
        sum + (run.stats?.afterGate || 0), 0
      );
      const avgPostsPerRun = totalRuns > 0 ? totalPosts / totalRuns : 0;
      
      return {
        totalRuns,
        totalCost,
        avgPostsPerRun,
        recentRuns: runs.slice(0, 10)
      };
    } catch (error) {
      console.error('Exception fetching search stats:', error);
      return {
        totalRuns: 0,
        totalCost: 0,
        avgPostsPerRun: 0,
        recentRuns: []
      };
    }
  }
}