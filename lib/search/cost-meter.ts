/**
 * Cost tracking for search pipeline
 * FR-8: Accumulate costs from Reddit, OpenAI, and Gemini
 */

export interface CostBreakdown {
  reddit: {
    enterpriseCalls: number;
    cost: number;
  };
  openai: {
    embedTokens: number;
    queryTokens: number;
    cost: number;
  };
  gemini: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  total: number;
}

export class CostMeter {
  private costs: CostBreakdown = {
    reddit: { enterpriseCalls: 0, cost: 0 },
    openai: { embedTokens: 0, queryTokens: 0, cost: 0 },
    gemini: { inputTokens: 0, outputTokens: 0, cost: 0 },
    total: 0
  };
  
  // Pricing constants (from PRD)
  private static readonly REDDIT_ENTERPRISE_COST = 0.24 / 1000; // $0.24 per 1k calls
  private static readonly OPENAI_EMBED_COST = 0.00002 / 1000; // $0.00002 per 1k tokens
  private static readonly OPENAI_QUERY_COST = 0.15 / 1_000_000; // GPT-4o-mini input
  private static readonly GEMINI_INPUT_COST = 0.075 / 1_000_000; // $0.075 per 1M tokens
  private static readonly GEMINI_OUTPUT_COST = 0.30 / 1_000_000; // $0.30 per 1M tokens
  
  /**
   * Track Reddit API calls
   */
  trackRedditCalls(calls: number, isEnterprise: boolean = false): void {
    if (isEnterprise) {
      this.costs.reddit.enterpriseCalls += calls;
      this.costs.reddit.cost += calls * CostMeter.REDDIT_ENTERPRISE_COST;
      this.updateTotal();
    }
    // Free tier calls have no cost
  }
  
  /**
   * Track OpenAI embedding tokens
   */
  trackOpenAIEmbeddings(tokens: number): void {
    this.costs.openai.embedTokens += tokens;
    this.costs.openai.cost += tokens * CostMeter.OPENAI_EMBED_COST;
    this.updateTotal();
  }
  
  /**
   * Track OpenAI query expansion tokens
   */
  trackOpenAIQuery(tokens: number): void {
    this.costs.openai.queryTokens += tokens;
    this.costs.openai.cost += tokens * CostMeter.OPENAI_QUERY_COST;
    this.updateTotal();
  }
  
  /**
   * Track Gemini Flash tokens
   */
  trackGeminiTokens(inputTokens: number, outputTokens: number): void {
    this.costs.gemini.inputTokens += inputTokens;
    this.costs.gemini.outputTokens += outputTokens;
    this.costs.gemini.cost += 
      (inputTokens * CostMeter.GEMINI_INPUT_COST) +
      (outputTokens * CostMeter.GEMINI_OUTPUT_COST);
    this.updateTotal();
  }
  
  /**
   * Add direct cost amount
   */
  addDirectCost(service: 'reddit' | 'openai' | 'gemini', amount: number): void {
    this.costs[service].cost += amount;
    this.updateTotal();
  }
  
  /**
   * Get current cost breakdown
   */
  getCosts(): CostBreakdown {
    return { ...this.costs };
  }
  
  /**
   * Get total cost in USD
   */
  getTotalCost(): number {
    return this.costs.total;
  }
  
  /**
   * Get cost per post (if post count provided)
   */
  getCostPerPost(postCount: number): number {
    if (postCount === 0) return 0;
    return this.costs.total / postCount;
  }
  
  /**
   * Check if within budget
   */
  isWithinBudget(budgetUSD: number): boolean {
    return this.costs.total <= budgetUSD;
  }
  
  /**
   * Reset all costs
   */
  reset(): void {
    this.costs = {
      reddit: { enterpriseCalls: 0, cost: 0 },
      openai: { embedTokens: 0, queryTokens: 0, cost: 0 },
      gemini: { inputTokens: 0, outputTokens: 0, cost: 0 },
      total: 0
    };
  }
  
  /**
   * Get formatted cost summary
   */
  getSummary(): string {
    const lines = [
      '💰 Cost Breakdown:',
      `  Reddit Enterprise: $${this.costs.reddit.cost.toFixed(4)} (${this.costs.reddit.enterpriseCalls} calls)`,
      `  OpenAI Embeddings: $${this.costs.openai.cost.toFixed(4)} (${this.costs.openai.embedTokens} tokens)`,
      `  Gemini Flash: $${this.costs.gemini.cost.toFixed(4)} (${this.costs.gemini.inputTokens} in / ${this.costs.gemini.outputTokens} out)`,
      `  ─────────────────`,
      `  Total: $${this.costs.total.toFixed(4)}`
    ];
    
    return lines.join('\n');
  }
  
  /**
   * Export metrics for monitoring
   */
  getMetrics(): Record<string, number> {
    return {
      'search_cost_reddit_usd': this.costs.reddit.cost,
      'search_cost_openai_usd': this.costs.openai.cost,
      'search_cost_gemini_usd': this.costs.gemini.cost,
      'search_cost_total_usd': this.costs.total,
      'search_reddit_enterprise_calls': this.costs.reddit.enterpriseCalls,
      'search_openai_embed_tokens': this.costs.openai.embedTokens,
      'search_gemini_input_tokens': this.costs.gemini.inputTokens,
      'search_gemini_output_tokens': this.costs.gemini.outputTokens
    };
  }
  
  private updateTotal(): void {
    this.costs.total = 
      this.costs.reddit.cost +
      this.costs.openai.cost +
      this.costs.gemini.cost;
  }
}