// Token bucket rate limiter for Reddit API
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];
  
  constructor(
    private maxTokens: number,
    private refillRate: number, // tokens per minute
    private burstMultiplier: number = 1.2 // Allow 20% burst capacity
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
    
    // Start the refill timer
    this.startRefillTimer();
  }
  
  private startRefillTimer(): void {
    setInterval(() => {
      this.refill();
      this.processQueue();
    }, 1000); // Check every second
  }
  
  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 60000; // Convert to minutes
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(
      this.tokens + tokensToAdd,
      this.maxTokens * this.burstMultiplier
    );
    
    this.lastRefill = now;
  }
  
  async acquire(tokens: number = 1): Promise<void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        this.refill();
        
        if (this.tokens >= tokens) {
          this.tokens -= tokens;
          resolve();
          return true;
        }
        
        return false;
      };
      
      if (!tryAcquire()) {
        this.queue.push(() => {
          if (tryAcquire()) {
            this.processQueue();
          } else {
            // Re-queue if still not enough tokens
            this.queue.push(() => tryAcquire());
          }
        });
      }
    });
  }
  
  private processQueue(): void {
    while (this.queue.length > 0 && this.tokens > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
  
  getStats() {
    return {
      availableTokens: Math.floor(this.tokens),
      maxTokens: this.maxTokens,
      queueLength: this.queue.length,
      refillRate: this.refillRate
    };
  }
}

// Jittered delay for worker startup to prevent thundering herd
export function getJitteredDelay(baseDelay: number, jitterPercent: number = 0.2): number {
  const jitter = baseDelay * jitterPercent;
  return baseDelay + (Math.random() * 2 - 1) * jitter;
}

// Exponential backoff calculator
export function getExponentialBackoff(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 60000
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  return getJitteredDelay(delay);
}