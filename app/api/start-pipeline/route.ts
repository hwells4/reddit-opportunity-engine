/**
 * API route to initiate a data processing pipeline on the external Gumloop service.
 * This endpoint acts as a "backend-for-frontend" (BFF), receiving requests from the
 * application's client, transforming the payload into the format expected by Gumloop,
 * and then triggering the long-running job.
 *
 * - POST /api/start-pipeline:
 *   Accepts a JSON body that can be in one of two formats (a flexible, modern
 *   `pipeline_inputs` format or a simpler legacy format).
 *
 *   The endpoint's workflow is as follows:
 *   1.  **Payload Transformation & Validation**: It validates the incoming request and
 *       transforms it into the flat key-value structure required by the Gumloop API.
 *       This includes important validation logic, such as ensuring that arrays of
 *       subreddits and their subscriber counts are consistent.
 *   2.  **Trigger External Pipeline**: It sends the transformed payload in a POST
 *       request to the Gumloop `start_pipeline` endpoint to begin the job.
 *   3.  **Log Transaction**: After a successful response from Gumloop, it saves the
 *       original request payload and the response from Gumloop to this application's
 *       own Supabase database. This is a critical step for logging, auditing,
 *       and debugging, creating a clear record of the transaction.
 *   4.  **Return Tracking Info**: It returns a success response to the client, including
 *       the `run_id` provided by Gumloop. The client can then use this `run_id` with
 *       the `/api/check-status` endpoint to poll for the pipeline's progress.
 */
import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Extract parameters for the new pipeline format
    const userId = body.user_id || "EZUCg1VIYohJJgKgwDTrTyH2sC32";
    const savedItemId = body.saved_item_id || "2VJar3Dimtp46XZzXAzhEZ";
    
    // Get base URL for webhook callbacks
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
      : "https://reddit-opportunity-engine-production.up.railway.app";
    
    // Build the new pipeline payload format (flat structure as shown in curl)
    let gumloopPayload: any = {
      run_id: body.run_id || "",
      base_url: baseUrl
    };
    
    if (body.pipeline_inputs) {
      // New comprehensive format from CLI - convert pipeline_inputs to flat structure
      for (const input of body.pipeline_inputs) {
        gumloopPayload[input.input_name] = input.value;
      }
      
      // Validate subreddit and subscriber arrays
      const subredditsInput = body.pipeline_inputs.find((i: any) => i.input_name === 'subreddits');
      const subscribersInput = body.pipeline_inputs.find((i: any) => i.input_name === 'subscribers');
      
      if (subredditsInput && subscribersInput) {
        const subredditArray = subredditsInput.value.split(';').filter((s: string) => s.trim());
        const subscriberArray = subscribersInput.value.split(';').filter((s: string) => s.trim());
        
        // Validate array lengths match
        if (subredditArray.length !== subscriberArray.length) {
          console.error('Array length mismatch:', {
            subreddits: subredditArray,
            subscribers: subscriberArray,
            subredditCount: subredditArray.length,
            subscriberCount: subscriberArray.length
          });
          return NextResponse.json(
            { error: `Subreddit count (${subredditArray.length}) does not match subscriber count (${subscriberArray.length})` },
            { status: 400 }
          );
        }
        
        // Validate no zero subscribers
        const invalidSubscribers = subscriberArray
          .map((sub: string, idx: number) => ({ value: parseInt(sub), index: idx, subreddit: subredditArray[idx] }))
          .filter((item: { value: number; index: number; subreddit: string }) => isNaN(item.value) || item.value <= 0);
        
        if (invalidSubscribers.length > 0) {
          const invalidList = invalidSubscribers
            .map((item: { value: number; index: number; subreddit: string }) => `${item.subreddit} (${item.value || 'invalid'})`)
            .join(', ');
          console.error('Invalid subscriber counts:', {
            invalidSubscribers,
            invalidList
          });
          return NextResponse.json(
            { error: `Invalid subscriber counts found for: ${invalidList}. All subreddits must have valid positive subscriber counts.` },
            { status: 400 }
          );
        }
      }
    } else {
      // Legacy simple format
      const { subreddit, focus, email, postLimit } = body;
      
      if (!subreddit || !email) {
        return NextResponse.json(
          { error: "Missing required fields: subreddit and email" },
          { status: 400 }
        );
      }
      
      gumloopPayload = {
        ...gumloopPayload,
        email: email,
        post_limit: postLimit || "75",
        category: focus || "",
        subreddit: subreddit
      };
    }

    // Build URL with query parameters as shown in the curl example
    const gumloopUrl = `https://api.gumloop.com/api/v1/start_pipeline?user_id=${userId}&saved_item_id=${savedItemId}`;

    const response = await fetch(gumloopUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GUMLOOP_BEARER_TOKEN}`,
      },
      body: JSON.stringify(gumloopPayload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gumloop API error:", errorData);
      return NextResponse.json(
        { error: "Failed to process request" },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Store webhook payload AFTER successful send if run_id is provided
    if (body.run_id || gumloopPayload.run_id) {
      const runId = body.run_id || gumloopPayload.run_id;
      console.log(`💾 Attempting to store webhook payload for run_id: ${runId}`);
      try {
        const supabase = getSupabaseClient();
        
        // Only update the webhook-specific fields, preserving all other run data
        const { error } = await supabase
          .from('runs')
          .update({
            webhook_payload: body,
            webhook_sent_at: new Date().toISOString(),
            webhook_response: data
          })
          .eq('run_id', runId);
          
        if (error) {
          console.error('❌ Failed to store webhook payload:', error);
          console.error('   Run ID:', runId);
          console.error('   Error details:', JSON.stringify(error, null, 2));
        } else {
          console.log(`✅ Successfully stored webhook payload for run ${runId}`);
        }
      } catch (dbError) {
        console.error('Failed to store webhook payload:', dbError);
        // Don't fail the request if storage fails
      }
    }
    
    // According to Gumloop docs, the response contains run_id and url
    return NextResponse.json({
      success: true,
      message: "Pipeline started successfully",
      run_id: data.run_id,
      tracking_url: data.url,
      saved_item_id: data.saved_item_id
    });
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 