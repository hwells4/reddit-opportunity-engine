/**
 * API route for polling the status of the multi-step "Add to Notion" process.
 * This endpoint provides real-time visibility into the progress of a job that
 * is being processed asynchronously on the server.
 *
 * It relies on a simple, in-memory `statusTracker` to store and retrieve the
 * state of each run. This means status is not persisted across server restarts.
 *
 * - GET /api/add-to-notion/status?runId=<run_id>:
 *   Checks the processing status of a specific run.
 *   - Fetches the status object from the in-memory store using the `runId`.
 *   - Returns a detailed progress report including the overall status ('processing',
 *     'completed', 'failed'), the percentage complete, a breakdown of completed
 *     sub-tasks, and any errors that have occurred.
 *   - This allows a frontend to display a dynamic progress bar and status updates
 *     to the user.
 *
 * - GET /api/add-to-notion/status:
 *   Acts as a debugging/admin endpoint to view all currently active processes.
 *   - Returns a summary list of all statuses currently held in memory.
 */
import { NextResponse } from "next/server";
import { getStatus, getAllStatuses } from "../statusTracker";

/**
 * GET /api/add-to-notion/status?runId=xxx
 * Check the processing status of a specific run
 * 
 * GET /api/add-to-notion/status
 * Get all active processing statuses (for debugging)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    
    if (runId) {
      // Get specific run status
      const status = getStatus(runId);
      
      if (!status) {
        return NextResponse.json(
          { error: "Run not found or status expired" },
          { status: 404 }
        );
      }
      
      const processingTime = Date.now() - status.startTime;
      const completedCount = Object.values(status.completedTasks).filter(v => v === true).length;
      const totalTasks = 4; // aiTitle, homepageIntro, quotes, reportFormatting
      
      return NextResponse.json({
        runId: status.runId,
        status: status.status,
        progress: {
          completed: completedCount,
          total: totalTasks,
          percentage: Math.round((completedCount / totalTasks) * 100)
        },
        tasks: status.completedTasks,
        errors: status.errors,
        processingTime: `${Math.round(processingTime / 1000)}s`,
        lastUpdated: new Date(status.lastUpdated).toISOString()
      });
    } else {
      // Get all statuses (admin/debug view)
      const allStatuses = getAllStatuses();
      
      return NextResponse.json({
        activeProcessing: allStatuses.length,
        statuses: allStatuses.map(status => ({
          runId: status.runId,
          status: status.status,
          startTime: new Date(status.startTime).toISOString(),
          errors: status.errors.length
        }))
      });
    }
  } catch (error) {
    console.error("Error fetching status:", error);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    );
  }
}