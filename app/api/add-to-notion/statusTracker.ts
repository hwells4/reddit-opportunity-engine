/**
 * Simple in-memory status tracker for async processing
 * In production, this could be replaced with Redis or database storage
 */

interface ProcessingStatus {
  runId: string;
  status: 'processing' | 'completed' | 'failed';
  startTime: number;
  completedTasks: {
    aiTitle?: boolean;
    homepageIntro?: boolean;
    quotes?: boolean;
    reportFormatting?: boolean;
  };
  errors: string[];
  lastUpdated: number;
}

// In-memory storage (resets on server restart)
const statusMap = new Map<string, ProcessingStatus>();

// Clean up old entries after 1 hour
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const STATUS_TTL = 60 * 60 * 1000; // 1 hour

setInterval(() => {
  const now = Date.now();
  for (const [key, status] of statusMap.entries()) {
    if (now - status.lastUpdated > STATUS_TTL) {
      statusMap.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

export function initializeStatus(runId: string): void {
  statusMap.set(runId, {
    runId,
    status: 'processing',
    startTime: Date.now(),
    completedTasks: {},
    errors: [],
    lastUpdated: Date.now()
  });
}

export function updateTaskStatus(
  runId: string, 
  task: keyof ProcessingStatus['completedTasks'], 
  completed: boolean
): void {
  const status = statusMap.get(runId);
  if (!status) return;
  
  status.completedTasks[task] = completed;
  status.lastUpdated = Date.now();
  
  // Check if all tasks are completed
  const allCompleted = Object.values(status.completedTasks).every(v => v === true);
  if (allCompleted) {
    status.status = 'completed';
  }
}

export function addError(runId: string, error: string): void {
  const status = statusMap.get(runId);
  if (!status) return;
  
  status.errors.push(error);
  status.lastUpdated = Date.now();
  
  // If too many errors, mark as failed
  if (status.errors.length >= 3) {
    status.status = 'failed';
  }
}

export function getStatus(runId: string): ProcessingStatus | null {
  return statusMap.get(runId) || null;
}

export function getAllStatuses(): ProcessingStatus[] {
  return Array.from(statusMap.values());
}

/**
 * Helper to track async operation with error handling
 */
export async function trackAsyncOperation<T>(
  runId: string,
  task: keyof ProcessingStatus['completedTasks'],
  operation: () => Promise<T>
): Promise<T | null> {
  try {
    const result = await operation();
    updateTaskStatus(runId, task, true);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addError(runId, `${task}: ${errorMessage}`);
    updateTaskStatus(runId, task, false);
    console.error(`[STATUS TRACKER] Error in ${task}:`, error);
    return null;
  }
}