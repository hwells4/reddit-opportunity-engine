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
          console.error('Failed to store webhook payload:', error);
        } else {
          console.log(`Stored webhook payload for run ${runId}`);
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