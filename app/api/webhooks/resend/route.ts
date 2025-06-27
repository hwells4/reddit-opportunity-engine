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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('run_id');
    
    if (!runId) {
      return NextResponse.json(
        { error: "run_id parameter is required" },
        { status: 400 }
      );
    }
    
    // Fetch the stored webhook payload
    const supabase = getSupabaseClient();
    
    const { data: runs, error } = await supabase
      .from('runs')
      .select('webhook_payload, webhook_sent_at, webhook_response')
      .eq('run_id', runId)
      .single();
    
    if (error || !runs) {
      return NextResponse.json(
        { error: "Run not found" },
        { status: 404 }
      );
    }
    
    const run = runs;
    
    if (!run.webhook_payload) {
      return NextResponse.json(
        { error: "No webhook payload stored for this run" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      run_id: runId,
      webhook_sent_at: run.webhook_sent_at,
      webhook_payload: run.webhook_payload,
      webhook_response: run.webhook_response
    });
    
  } catch (error) {
    console.error("Error fetching webhook:", error);
    return NextResponse.json(
      { error: "Failed to fetch webhook data" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { run_id, modifications, ai_prompt, test_workflows } = body;
    
    if (!run_id) {
      return NextResponse.json(
        { error: "run_id is required" },
        { status: 400 }
      );
    }
    
    // Fetch the original webhook payload
    const supabase = getSupabaseClient();
    
    const { data: run, error } = await supabase
      .from('runs')
      .select('webhook_payload')
      .eq('run_id', run_id)
      .single();
    
    if (error || !run) {
      return NextResponse.json(
        { error: "Run not found" },
        { status: 404 }
      );
    }
    
    const originalPayload = run.webhook_payload;
    
    if (!originalPayload) {
      return NextResponse.json(
        { error: "No webhook payload stored for this run" },
        { status: 404 }
      );
    }
    
    // Apply modifications
    let modifiedPayload = { ...originalPayload };
    
    if (ai_prompt) {
      // Use AI to modify the payload based on the prompt
      try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

        const systemPrompt = `You are a webhook payload modifier. You will receive a webhook payload and a modification request.
Your job is to modify the payload according to the request while maintaining its structure and validity.

Rules:
1. Maintain the same overall structure
2. Only modify what's requested
3. Ensure array lengths remain consistent (e.g., subreddits and subscribers must have same count)
4. Keep all required fields
5. Return valid JSON

Original payload structure should be preserved unless explicitly asked to change it.`;

        const userPrompt = `Original webhook payload:
${JSON.stringify(originalPayload, null, 2)}

Modification request: ${ai_prompt}

Return the modified payload as valid JSON.`;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" }
          })
        });

        if (!response.ok) {
          throw new Error(`OpenRouter API error: ${response.status}`);
        }

        const completion = await response.json();
        modifiedPayload = JSON.parse(completion.choices[0].message.content || "{}");
      } catch (aiError) {
        console.error('AI modification failed:', aiError);
        return NextResponse.json(
          { error: "Failed to apply AI modifications" },
          { status: 500 }
        );
      }
    } else if (modifications) {
      // Apply direct modifications
      if (modifications.pipeline_inputs) {
        // Handle pipeline_inputs modifications
        modifiedPayload.pipeline_inputs = modifiedPayload.pipeline_inputs || [];
        
        for (const mod of modifications.pipeline_inputs) {
          const existingIndex = modifiedPayload.pipeline_inputs.findIndex(
            (input: any) => input.input_name === mod.input_name
          );
          
          if (existingIndex >= 0) {
            modifiedPayload.pipeline_inputs[existingIndex].value = mod.value;
          } else {
            modifiedPayload.pipeline_inputs.push(mod);
          }
        }
      } else {
        // Direct field modifications
        modifiedPayload = { ...modifiedPayload, ...modifications };
      }
    }
    
    // Generate new run_id for the resend
    const newRunId = `${run_id}-resend-${Date.now()}`;
    
    // Update the run_id in the payload
    if (modifiedPayload.run_id) {
      modifiedPayload.run_id = newRunId;
    }
    if (modifiedPayload.pipeline_inputs) {
      const runIdInput = modifiedPayload.pipeline_inputs.find(
        (input: any) => input.input_name === 'run_id'
      );
      if (runIdInput) {
        runIdInput.value = newRunId;
      }
    }
    
    // Determine workflows to test
    const workflows = test_workflows || [{ 
      workflow_name: 'Original', 
      workflow_url: 'original' // Special flag to use original endpoint
    }];
    const results: any[] = [];
    
    // Send to each workflow
    for (let i = 0; i < workflows.length; i++) {
      const workflow = workflows[i];
      const testRunId = workflows.length > 1 ? `${newRunId}-${workflow.workflow_name.replace(/\s+/g, '-').toLowerCase()}` : newRunId;
      
      // Prepare payload for this workflow
      let testPayload: any;
      
      if (workflow.workflow_url === 'original') {
        // Send through original start-pipeline endpoint
        testPayload = { ...modifiedPayload };
        if (testPayload.run_id) {
          testPayload.run_id = testRunId;
        }
        if (testPayload.pipeline_inputs) {
          const runIdInput = testPayload.pipeline_inputs.find(
            (input: any) => input.input_name === 'run_id'
          );
          if (runIdInput) {
            runIdInput.value = testRunId;
          }
        }
      } else {
        // Send directly to Gumloop with the format Gumloop expects
        testPayload = {};
        
        // Convert pipeline_inputs to flat structure for direct Gumloop call
        if (modifiedPayload.pipeline_inputs) {
          for (const input of modifiedPayload.pipeline_inputs) {
            testPayload[input.input_name] = input.value;
          }
        } else {
          // Legacy format
          testPayload = { ...modifiedPayload };
        }
        
        // Update run_id
        testPayload.run_id = testRunId;
        
        // Add base_url for webhook callbacks
        const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
          : "https://reddit-opportunity-engine-production.up.railway.app";
        testPayload.base_url = baseUrl;
      }
      
      try {
        const targetUrl = workflow.workflow_url === 'original' 
          ? '/api/start-pipeline' 
          : workflow.workflow_url;
          
        console.log(`Sending webhook to ${workflow.workflow_name} (${targetUrl}) with run_id: ${testRunId}`);
        
        const webhookResponse = await fetch(targetUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(workflow.workflow_url !== 'original' && process.env.GUMLOOP_BEARER_TOKEN 
              ? { 'Authorization': `Bearer ${process.env.GUMLOOP_BEARER_TOKEN}` }
              : {})
          },
          body: JSON.stringify(testPayload)
        });
        
        const webhookResult = await webhookResponse.json();
        
        results.push({
          workflow_name: workflow.workflow_name,
          workflow_url: targetUrl,
          run_id: testRunId,
          success: webhookResponse.ok,
          status: webhookResponse.status,
          response: webhookResult,
          error: webhookResponse.ok ? null : webhookResult.error || webhookResult.message
        });
        
      } catch (error: any) {
        results.push({
          workflow_name: workflow.workflow_name,
          workflow_url: workflow.workflow_url,
          run_id: testRunId,
          success: false,
          status: 500,
          response: null,
          error: error.message
        });
      }
    }
    
    // Check if any succeeded
    const successCount = results.filter(r => r.success).length;
    const hasAnySuccess = successCount > 0;
    
    return NextResponse.json({
      success: hasAnySuccess,
      original_run_id: run_id,
      test_results: results,
      summary: {
        total_workflows: workflows.length,
        successful: successCount,
        failed: workflows.length - successCount
      },
      modifications_applied: modifications || { ai_prompt },
      modified_payload: modifiedPayload
    });
    
  } catch (error) {
    console.error("Error resending webhook:", error);
    return NextResponse.json(
      { error: "Failed to resend webhook" },
      { status: 500 }
    );
  }
}