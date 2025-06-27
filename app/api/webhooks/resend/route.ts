import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { RedditValidator } from '../../../../lib/discovery/reddit-validator';

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
    
    // Apply modifications with intelligent validation
    let modifiedPayload = { ...originalPayload };
    
    if (ai_prompt) {
      // Use AI to modify the payload based on the prompt
      try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

        const systemPrompt = `You are an intelligent webhook payload modifier for Reddit analysis pipelines. You will receive a webhook payload and a modification request.
Your job is to modify the payload according to the request while maintaining its structure and validity.

IMPORTANT RULES:
1. Maintain the same overall structure and format
2. Only modify what's explicitly requested
3. If modifying subreddits, ONLY change the subreddits field - do NOT change subscribers (the system will auto-validate and adjust subscriber counts)
4. Keep all required fields (run_id, email, post_limit, etc.)
5. Preserve pipeline_inputs array structure if present
6. Return valid JSON that matches the original structure exactly

SUBREDDIT HANDLING:
- When user requests subreddit changes, only modify the 'subreddits' field
- Do NOT modify 'subscribers' field - it will be automatically updated with current Reddit API data
- Example: If user says "change subreddits to programming;webdev", only update subreddits field

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
    
    // Intelligent validation and auto-adjustment for subreddit changes
    const needsSubredditValidation = await checkIfSubredditModification(modifiedPayload, originalPayload);
    if (needsSubredditValidation) {
      console.log('🔍 Detected subreddit changes, running intelligent validation...');
      modifiedPayload = await validateAndAdjustSubreddits(modifiedPayload);
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
        const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
          : "https://reddit-opportunity-engine-production.up.railway.app";
          
        const targetUrl = workflow.workflow_url === 'original' 
          ? `${baseUrl}/api/start-pipeline` 
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

// Helper function to check if subreddit modifications were made
async function checkIfSubredditModification(modifiedPayload: any, originalPayload: any): Promise<boolean> {
  // Check if subreddits were modified in pipeline_inputs
  if (modifiedPayload.pipeline_inputs) {
    const originalSubreddits = getSubredditsFromPayload(originalPayload);
    const modifiedSubreddits = getSubredditsFromPayload(modifiedPayload);
    
    if (originalSubreddits !== modifiedSubreddits) {
      return true;
    }
  }
  
  return false;
}

// Helper function to extract subreddits from payload
function getSubredditsFromPayload(payload: any): string {
  if (payload.pipeline_inputs) {
    const subredditsInput = payload.pipeline_inputs.find(
      (input: any) => input.input_name === 'subreddits'
    );
    return subredditsInput?.value || '';
  }
  return payload.subreddits || '';
}

// Helper function to extract subscribers from payload
function getSubscribersFromPayload(payload: any): string {
  if (payload.pipeline_inputs) {
    const subscribersInput = payload.pipeline_inputs.find(
      (input: any) => input.input_name === 'subscribers'
    );
    return subscribersInput?.value || '';
  }
  return payload.subscribers || '';
}

// Intelligent subreddit validation and subscriber adjustment
async function validateAndAdjustSubreddits(payload: any): Promise<any> {
  const validator = new RedditValidator();
  const subredditsStr = getSubredditsFromPayload(payload);
  
  if (!subredditsStr) {
    console.log('❌ No subreddits found in payload');
    return payload;
  }

  const subredditNames = subredditsStr.split(';').map(s => s.trim()).filter(s => s);
  console.log(`🔍 Validating ${subredditNames.length} subreddits: ${subredditNames.join(', ')}`);

  try {
    // Validate all subreddits and get their subscriber counts
    const validatedSubreddits = await validator.validateSubreddits(subredditNames);
    
    // Filter to only valid subreddits
    const validSubreddits = validatedSubreddits.filter(
      sub => sub.validation_status === 'valid' && sub.subscribers > 0
    );

    if (validSubreddits.length === 0) {
      throw new Error('No valid subreddits found after validation');
    }

    // Update the payload with validated data
    const validNames = validSubreddits.map(sub => sub.name);
    const validSubscribers = validSubreddits.map(sub => sub.subscribers.toString());

    console.log(`✅ Validated ${validSubreddits.length}/${subredditNames.length} subreddits`);
    console.log('📊 Updated subscriber counts:');
    validSubreddits.forEach(sub => {
      console.log(`   • r/${sub.name}: ${sub.subscribers.toLocaleString()} subscribers`);
    });

    // Update the payload
    if (payload.pipeline_inputs) {
      // Update pipeline_inputs format
      const existingSubredditsIndex = payload.pipeline_inputs.findIndex(
        (input: any) => input.input_name === 'subreddits'
      );
      const existingSubscribersIndex = payload.pipeline_inputs.findIndex(
        (input: any) => input.input_name === 'subscribers'
      );

      if (existingSubredditsIndex >= 0) {
        payload.pipeline_inputs[existingSubredditsIndex].value = validNames.join(';');
      }
      
      if (existingSubscribersIndex >= 0) {
        payload.pipeline_inputs[existingSubscribersIndex].value = validSubscribers.join(';');
      } else {
        // Add subscribers if it doesn't exist
        payload.pipeline_inputs.push({
          input_name: 'subscribers',
          value: validSubscribers.join(';')
        });
      }
    } else {
      // Update direct format
      payload.subreddits = validNames.join(';');
      payload.subscribers = validSubscribers.join(';');
    }

    return payload;

  } catch (error) {
    console.error('❌ Error validating subreddits:', error);
    throw new Error(`Failed to validate subreddits: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}