import { EventEmitter } from 'events';

export interface WorkerTask<T, R> {
  id: string;
  data: T;
  priority?: number;
}

export interface WorkerResult<R> {
  id: string;
  result?: R;
  error?: Error;
  duration: number;
}

export interface WorkerPoolOptions {
  name: string;
  concurrency: number;
  taskTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export class WorkerPool<T, R> extends EventEmitter {
  private queue: WorkerTask<T, R>[] = [];
  private activeWorkers = 0;
  private isShutdown = false;
  private results: Map<string, WorkerResult<R>> = new Map();
  
  constructor(
    private processTask: (data: T) => Promise<R>,
    private options: WorkerPoolOptions
  ) {
    super();
  }
  
  async addTask(task: WorkerTask<T, R>): Promise<void> {
    if (this.isShutdown) {
      throw new Error(`Worker pool ${this.options.name} is shutdown`);
    }
    
    // Add to priority queue
    this.queue.push(task);
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Try to process immediately if workers available
    this.processNext();
  }
  
  async addBatch(tasks: WorkerTask<T, R>[]): Promise<void> {
    for (const task of tasks) {
      await this.addTask(task);
    }
  }
  
  private async processNext(): Promise<void> {
    if (this.activeWorkers >= this.options.concurrency || this.queue.length === 0) {
      return;
    }
    
    const task = this.queue.shift();
    if (!task) return;
    
    this.activeWorkers++;
    const startTime = Date.now();
    
    try {
      const result = await this.executeWithRetry(task);
      
      const workerResult: WorkerResult<R> = {
        id: task.id,
        result,
        duration: Date.now() - startTime
      };
      
      this.results.set(task.id, workerResult);
      this.emit('taskComplete', workerResult);
      
    } catch (error) {
      const workerResult: WorkerResult<R> = {
        id: task.id,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime
      };
      
      this.results.set(task.id, workerResult);
      this.emit('taskError', workerResult);
    } finally {
      this.activeWorkers--;
      
      // Process next task if available
      if (!this.isShutdown) {
        setImmediate(() => this.processNext());
      }
      
      // Emit idle event when all tasks complete
      if (this.activeWorkers === 0 && this.queue.length === 0) {
        this.emit('idle');
      }
    }
  }
  
  private async executeWithRetry(task: WorkerTask<T, R>): Promise<R> {
    const maxAttempts = this.options.retryAttempts || 1;
    const baseDelay = this.options.retryDelay || 1000;
    
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Execute with timeout if specified
        if (this.options.taskTimeout) {
          return await this.withTimeout(
            this.processTask(task.data),
            this.options.taskTimeout
          );
        }
        
        return await this.processTask(task.data);
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxAttempts) {
          // Check if it's a rate limit error
          const isRateLimitError = lastError.message.includes('429') || 
                                   lastError.message.includes('rate limit') ||
                                   lastError.message.includes('rate-limited');
          
          // For rate limit errors, use longer exponential backoff
          const delay = isRateLimitError 
            ? Math.min(baseDelay * Math.pow(2, attempt - 1), 60000) // Max 60s
            : baseDelay * attempt;
          
          await this.delay(delay);
          this.emit('taskRetry', { task, attempt, error: lastError });
        }
      }
    }
    
    throw lastError || new Error('Unknown error in worker execution');
  }
  
  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`Task timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async waitForIdle(): Promise<void> {
    if (this.activeWorkers === 0 && this.queue.length === 0) {
      return;
    }
    
    return new Promise(resolve => {
      this.once('idle', resolve);
    });
  }
  
  async shutdown(graceful = true): Promise<void> {
    this.isShutdown = true;
    
    if (graceful) {
      await this.waitForIdle();
    } else {
      this.queue = [];
    }
    
    this.removeAllListeners();
  }
  
  getResults(): WorkerResult<R>[] {
    return Array.from(this.results.values());
  }
  
  getStats() {
    return {
      name: this.options.name,
      queued: this.queue.length,
      active: this.activeWorkers,
      completed: this.results.size,
      concurrency: this.options.concurrency
    };
  }
}

// Factory for creating stage-specific worker pools
export class WorkerPoolFactory {
  static createSearchPool(concurrency: number): WorkerPool<any, any> {
    return new WorkerPool(
      async (data) => data, // Placeholder - will be replaced with actual implementation
      {
        name: 'reddit-search',
        concurrency,
        taskTimeout: 30000, // 30s timeout per search
        retryAttempts: 3,
        retryDelay: 1000
      }
    );
  }
  
  static createEmbedPool(concurrency: number): WorkerPool<any, any> {
    return new WorkerPool(
      async (data) => data, // Placeholder
      {
        name: 'embedding-prune',
        concurrency,
        taskTimeout: 20000, // 20s timeout per batch
        retryAttempts: 2,
        retryDelay: 500
      }
    );
  }
  
  static createGatePool(concurrency: number): WorkerPool<any, any> {
    return new WorkerPool(
      async (data) => data, // Placeholder
      {
        name: 'llm-gate',
        concurrency,
        taskTimeout: 10000, // 10s timeout per gate check
        retryAttempts: 2,
        retryDelay: 500
      }
    );
  }
}