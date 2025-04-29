import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    // Get runId from query params
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    const userId = process.env.GUMLOOP_USER_ID || "EZUCg1VIYohJJgKgwDTrTyH2sC32"; // Use the same user ID as in start-pipeline

    if (!runId) {
      return NextResponse.json(
        { error: "Missing runId parameter" },
        { status: 400 }
      );
    }

    // Query Gumloop API for pipeline run status using the get_pl_run endpoint
    const response = await fetch(
      `https://api.gumloop.com/api/v1/get_pl_run?run_id=${runId}&user_id=${userId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.GUMLOOP_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gumloop API error:", errorData);
      return NextResponse.json(
        { error: "Failed to fetch pipeline status" },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Map Gumloop state to progress percentage and message
    let progress = 0;
    let status = "Starting analysis...";
    
    // Get the last log entry for better status messages
    const lastLog = data.log && data.log.length > 0 ? data.log[data.log.length - 1] : "";
    // Extract meaningful info from log if possible
    const logMessage = extractLogMessage(lastLog);
    
    if (data.state) {
      switch (data.state) {
        case "STARTED":
          progress = 10;
          status = logMessage || "Starting analysis...";
          break;
        case "RUNNING":
          // For RUNNING state, calculate progress based on log length and timestamps
          // This is a better estimate than fixed progress steps
          progress = calculateProgressFromLogs(data);
          
          // Use the log message if available, otherwise use default messages
          if (logMessage) {
            status = logMessage;
          } else if (progress < 30) {
            status = "Collecting data from Reddit...";
          } else if (progress < 50) {
            status = "Analyzing post engagement patterns...";
          } else if (progress < 70) {
            status = "Identifying product opportunities...";
          } else {
            status = "Generating opportunity report...";
          }
          break;
        case "DONE":
          progress = 100;
          status = "Analysis complete! Report being prepared...";
          break;
        case "FAILED":
          progress = 0;
          status = logMessage || "Analysis failed. We'll try again.";
          break;
        case "TERMINATED":
          progress = 0;
          status = "Analysis was terminated. Please try again.";
          break;
        default:
          progress = 30;
          status = "Processing...";
      }
    }

    // Return detailed response with raw data for debugging
    return NextResponse.json({
      runId,
      progress,
      status,
      state: data.state || "unknown",
      logLength: data.log?.length || 0,
      lastLog: lastLog,
      finished: data.state === "DONE" || data.state === "FAILED" || data.state === "TERMINATED",
      createdTs: data.created_ts,
      finishedTs: data.finished_ts,
      rawData: process.env.NODE_ENV === "development" ? {
        state: data.state,
        logs: data.log?.slice(-5) || [], // Last 5 logs for debugging
        outputs: data.outputs || {}
      } : undefined
    });
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to calculate progress based on logs and timestamps
function calculateProgressFromLogs(data: any): number {
  if (!data.log || data.log.length === 0) return 10;
  
  const logLength = data.log.length;
  
  // If we have timestamps, use them to calculate a more accurate progress
  if (data.created_ts && !data.finished_ts) {
    const startTime = new Date(data.created_ts).getTime();
    const currentTime = new Date().getTime();
    const estimatedTotalTime = 5 * 60 * 1000; // Assume 5 minutes for completion
    
    const elapsed = currentTime - startTime;
    const progressByTime = Math.min(95, Math.max(10, (elapsed / estimatedTotalTime) * 100));
    
    // Combine log-based and time-based progress estimates
    const logBasedProgress = Math.min(95, Math.max(10, (logLength / 15) * 100));
    return Math.round((progressByTime * 0.7) + (logBasedProgress * 0.3));
  }
  
  // Fallback to log-based progress
  return Math.min(95, Math.max(10, (logLength / 15) * 100));
}

// Helper function to extract meaningful message from log entry
function extractLogMessage(logEntry: string): string {
  if (!logEntry) return "";
  
  // Remove ANSI color codes and system prefixes
  const cleanedLog = logEntry
    .replace(/\u001b\[\d+m/g, '')
    .replace(/__system__: __\w+__:/g, '')
    .trim();
    
  // Extract meaningful text - this would need to be customized based on actual log format
  if (cleanedLog.includes("collecting data")) {
    return "Collecting data from Reddit...";
  } else if (cleanedLog.includes("analyzing")) {
    return "Analyzing Reddit content...";
  } else if (cleanedLog.includes("generating")) {
    return "Creating your opportunity report...";
  } else if (cleanedLog.includes("error") || cleanedLog.includes("failed")) {
    return `Error: ${cleanedLog}`;
  } else if (cleanedLog.length > 10) {
    // If it's a substantial message, return it directly
    return cleanedLog;
  }
  
  return "";
} 