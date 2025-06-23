import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Handle both old simple format and new comprehensive format
    let gumloopPayload;
    
    if (body.pipeline_inputs) {
      // New comprehensive format from CLI
      gumloopPayload = {
        user_id: body.user_id || "EZUCg1VIYohJJgKgwDTrTyH2sC32",
        saved_item_id: body.saved_item_id || "jed6MsnPKNGUmh36KgcP65",
        pipeline_inputs: body.pipeline_inputs
      };
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
        user_id: "EZUCg1VIYohJJgKgwDTrTyH2sC32",
        saved_item_id: "jed6MsnPKNGUmh36KgcP65",
        pipeline_inputs: [
          { input_name: "email", value: email },
          { input_name: "post_limit", value: postLimit || "75" },
          { input_name: "category", value: focus || "" },
          { input_name: "subreddit", value: subreddit },
        ]
      };
    }

    const response = await fetch(
      "https://api.gumloop.com/api/v1/start_pipeline",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GUMLOOP_API_KEY}`,
        },
        body: JSON.stringify(gumloopPayload),
      }
    );

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