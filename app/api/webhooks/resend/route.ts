import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { RedditValidator } from '../../../../lib/discovery/reddit-validator';
import { randomUUID } from 'crypto';

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
    
    console.log('🔄 Webhook resend request received:');
    console.log(`   Run ID: ${run_id}`);
    console.log(`   Has AI prompt: ${!!ai_prompt}`);
    console.log(`   Has modifications: ${!!modifications}`);
    if (ai_prompt) console.log(`   AI prompt: "${ai_prompt}"`);
    if (modifications) console.log(`   Modifications:`, JSON.stringify(modifications, null, 2));
    
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
      console.log('🤖 Processing AI modification request...');
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
        console.log('✅ AI modification completed successfully');
        console.log('📝 AI-modified payload preview:', JSON.stringify(modifiedPayload, null, 2).substring(0, 500) + '...');
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
    
    // Create database entry for the new run to prevent system breakage
    console.log('📋 Creating database entry for resent webhook...');
    const newRunId = await createResendRunViaAPI(run_id, modifiedPayload);
    console.log(`🆔 Created new run: ${newRunId} (from original: ${run_id})`);
    
    // Small delay to ensure database entry is committed before webhook send
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify database entry was created successfully
    const supabaseVerify = getSupabaseClient();
    const { data: verifyRun, error: verifyError } = await supabaseVerify
      .from('runs')
      .select('run_id, status')
      .eq('run_id', newRunId)
      .single();
      
    if (verifyError || !verifyRun) {
      console.error('❌ Failed to verify database entry creation:', verifyError);
      throw new Error('Database entry verification failed - cannot proceed with webhook');
    } else {
      console.log(`✅ Verified database entry exists for run: ${newRunId}`);
    }
    
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
      // For A/B testing, we use the same run_id for all workflows
      // This ensures webhook storage works correctly
      const testRunId = newRunId;
      
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
        
        // Store webhook payload in database AFTER successful send (just like normal flow)
        if (webhookResponse.ok && testRunId) {
          try {
            console.log(`💾 Storing webhook payload for resent run: ${testRunId}`);
            const supabaseClient = getSupabaseClient();
            const { error: storageError } = await supabaseClient
              .from('runs')
              .update({
                webhook_payload: testPayload,
                webhook_sent_at: new Date().toISOString(),
                webhook_response: webhookResult
              })
              .eq('run_id', testRunId);
              
            if (storageError) {
              console.error('❌ Failed to store webhook payload for resent run:', storageError);
            } else {
              console.log(`✅ Stored webhook payload for resent run: ${testRunId}`);
            }
          } catch (storageErr) {
            console.error('❌ Error storing webhook payload:', storageErr);
          }
        }
        
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

// Create database entry for resent webhook using existing API
async function createResendRunViaAPI(originalRunId: string, modifiedPayload: any): Promise<string> {
  const supabaseClient = getSupabaseClient();
  
  try {
    // Fetch original run data to inherit metadata
    const { data: originalRun, error: fetchError } = await supabaseClient
      .from('runs')
      .select('*')
      .eq('run_id', originalRunId)
      .single();
    
    if (fetchError || !originalRun) {
      console.error('❌ Failed to fetch original run:', fetchError);
      throw new Error('Cannot create resend entry without original run data');
    }
    
    // Extract updated data from modified payload
    const getFieldFromPayload = (fieldName: string): any => {
      if (modifiedPayload.pipeline_inputs) {
        const input = modifiedPayload.pipeline_inputs.find((i: any) => i.input_name === fieldName);
        return input?.value;
      }
      return modifiedPayload[fieldName];
    };
    
    // Get base URL for internal API call
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
      : "https://reddit-opportunity-engine-production.up.railway.app";
    
    // Prepare run data for the existing API
    // NOTE: Do NOT include run_id - the API generates its own
    const runData = {
      user_question: originalRun.user_question,
      problem_area: originalRun.problem_area,
      target_audience: originalRun.target_audience,
      product_type: originalRun.product_type,
      product_name: originalRun.product_name,
      account_id: originalRun.account_id, // Critical - inherit account association
      user_id: originalRun.user_id,
      
      // Use modified subreddits if available, otherwise inherit from original
      subreddits: getFieldFromPayload('subreddits') ? 
        getFieldFromPayload('subreddits').split(';') : 
        originalRun.subreddits
    };
    
    // Call existing /api/runs endpoint
    const response = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(runData)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API call failed: ${errorData.error || response.statusText}`);
    }
    
    const result = await response.json();
    
    // CRITICAL: Return the actual run_id from the API, not our pre-generated one
    const actualRunId = result.run_id;
    
    console.log(`✅ Created database entry for resent run: ${actualRunId}`);
    console.log(`   Inherited from: ${originalRunId}`);
    console.log(`   Account: ${originalRun.account_id}`);
    console.log(`   Subreddits: ${runData.subreddits?.join(', ') || 'none'}`);
    
    return actualRunId; // Return the actual run_id
    
  } catch (error) {
    console.error('❌ Error creating resend run entry:', error);
    throw error;
  }
}