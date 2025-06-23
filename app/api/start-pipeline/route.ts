import { NextResponse } from "next/server";

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