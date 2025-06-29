/**
 * API route providing full CRUD (Create, Read, Update) functionality for managing
 * "Gumloop Workflows". These workflows represent the different data processing
 * pipeline templates that can be triggered on the external Gumloop service.
 *
 * This endpoint interacts directly with the `gumloop_workflows` table in the
 * Supabase database to persist and manage these workflow configurations.
 *
 * - GET /api/workflows:
 *   Lists all active workflows. It supports a `search` query parameter to filter
 *   workflows by name or description. This is used to populate UI elements where
 *   a user can select a pipeline to run.
 *
 * - POST /api/workflows:
 *   Creates a new workflow record. It requires a `workflow_name` and `workflow_url`.
 *   It includes logic to automatically parse the `user_id` and `saved_item_id`
 *   from the `workflow_url` if they are not provided separately, simplifying
 *   the registration of new pipeline templates.
 *
 * - PUT /api/workflows?workflow_id=<...>:
 *   Updates an existing workflow. It identifies the workflow by the `workflow_id`
 *   query parameter and updates the record with the fields provided in the request
 *   body. This allows for editing details or deactivating a workflow.
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

// GET /api/workflows - List all workflows
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    
    const supabase = getSupabaseClient();
    
    let query = supabase
      .from('gumloop_workflows')
      .select('*')
      .eq('is_active', true)
      .order('workflow_name');
    
    if (search) {
      query = query.or(`workflow_name.ilike.%${search}%,description.ilike.%${search}%`);
    }
    
    const { data: workflows, error } = await query;
    
    if (error) {
      console.error('Error fetching workflows:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workflows' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(workflows);
    
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/workflows - Create new workflow
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workflow_name, workflow_url, description, user_id, saved_item_id } = body;
    
    if (!workflow_name || !workflow_url) {
      return NextResponse.json(
        { error: 'workflow_name and workflow_url are required' },
        { status: 400 }
      );
    }
    
    // Extract user_id and saved_item_id from URL if not provided
    let extractedUserId = user_id;
    let extractedSavedItemId = saved_item_id;
    
    if (!extractedUserId || !extractedSavedItemId) {
      try {
        const url = new URL(workflow_url);
        if (!extractedUserId) {
          extractedUserId = url.searchParams.get('user_id') || '';
        }
        if (!extractedSavedItemId) {
          extractedSavedItemId = url.searchParams.get('saved_item_id') || '';
        }
      } catch (urlError) {
        // Invalid URL, continue without extraction
      }
    }
    
    const supabase = getSupabaseClient();
    
    const { data: workflow, error } = await supabase
      .from('gumloop_workflows')
      .insert({
        workflow_name,
        workflow_url,
        description,
        user_id: extractedUserId,
        saved_item_id: extractedSavedItemId
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating workflow:', error);
      return NextResponse.json(
        { error: 'Failed to create workflow' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(workflow);
    
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/workflows?workflow_id=X - Update workflow
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workflow_id = searchParams.get('workflow_id');
    
    if (!workflow_id) {
      return NextResponse.json(
        { error: 'workflow_id parameter is required' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const { workflow_name, workflow_url, description, is_active } = body;
    
    const supabase = getSupabaseClient();
    
    const updateData: any = { updated_at: new Date().toISOString() };
    
    if (workflow_name) updateData.workflow_name = workflow_name;
    if (workflow_url) updateData.workflow_url = workflow_url;
    if (description !== undefined) updateData.description = description;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    const { data: workflow, error } = await supabase
      .from('gumloop_workflows')
      .update(updateData)
      .eq('workflow_id', workflow_id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating workflow:', error);
      return NextResponse.json(
        { error: 'Failed to update workflow' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(workflow);
    
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}