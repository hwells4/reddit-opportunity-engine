import { NextRequest, NextResponse } from 'next/server'
import { DiscoveryOrchestrator, HumanSelectionRequest, ValidatedSubreddit } from '@/lib/discovery'

const orchestrator = new DiscoveryOrchestrator()

export async function POST(request: NextRequest) {
  try {
    const body: HumanSelectionRequest = await request.json()
    
    if (!body.candidates || !Array.isArray(body.candidates)) {
      return NextResponse.json(
        { error: 'candidates array is required' },
        { status: 400 }
      )
    }

    if (!body.selected_subreddits || !Array.isArray(body.selected_subreddits)) {
      return NextResponse.json(
        { error: 'selected_subreddits array is required' },
        { status: 400 }
      )
    }

    console.log(`👤 Human selected ${body.selected_subreddits.length} subreddits from ${body.candidates.length} candidates`)

    // Filter candidates to only selected ones
    const selectedCandidates = body.candidates.filter(candidate => 
      body.selected_subreddits.includes(candidate.name)
    )

    if (selectedCandidates.length === 0) {
      return NextResponse.json(
        { error: 'No valid candidates found for selected subreddit names' },
        { status: 400 }
      )
    }

    // Validate the selected subreddits (get fresh data)
    const validatedSelected = await orchestrator.validateSpecificSubreddits(
      body.selected_subreddits
    )

    const validSubreddits = validatedSelected.filter(s => s.validation_status === 'valid')

    if (validSubreddits.length === 0) {
      return NextResponse.json(
        { 
          error: 'None of the selected subreddits are valid/accessible',
          validated_results: validatedSelected
        },
        { status: 400 }
      )
    }

    // Store selection for potential use in Gumloop workflow
    const selectionRecord = {
      selection_id: `sel_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      selected_subreddits: validSubreddits,
      original_candidates: body.candidates,
      user_notes: body.user_notes,
      timestamp: new Date().toISOString(),
      stats: {
        total_candidates: body.candidates.length,
        total_selected: body.selected_subreddits.length,
        total_valid: validSubreddits.length,
        average_subscribers: Math.round(
          validSubreddits.reduce((sum, sub) => sum + sub.subscribers, 0) / validSubreddits.length
        )
      }
    }

    console.log(`✅ Selection complete: ${validSubreddits.length} valid subreddits ready for analysis`)

    return NextResponse.json({
      success: true,
      selection_record: selectionRecord,
      message: `Successfully selected ${validSubreddits.length} valid subreddits for analysis`
    })

  } catch (error) {
    console.error('Selection error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error during selection processing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const product = searchParams.get('product')
    const audience = searchParams.get('audience')

    if (!product || !audience) {
      return NextResponse.json(
        { error: 'product and audience query parameters are required' },
        { status: 400 }
      )
    }

    console.log('🔍 Quick discovery for selection preview...')

    // Quick discovery for human selection preview
    const quickCandidates = await orchestrator.quickDiscovery({
      product: product,
      audience: audience
    })

    if (quickCandidates.length === 0) {
      return NextResponse.json({
        success: true,
        candidates: [],
        message: 'No candidates found for quick discovery'
      })
    }

    // Get basic info for each candidate
    const candidatesWithInfo = await Promise.all(
      quickCandidates.map(async (name) => {
        try {
          const info = await orchestrator.getSubredditInfo(name)
          return info ? {
            name,
            subscribers: info.subscribers,
            description: info.description,
            preview: true
          } : null
        } catch {
          return null
        }
      })
    )

    const validCandidates = candidatesWithInfo.filter(Boolean)

    return NextResponse.json({
      success: true,
      candidates: validCandidates,
      total_found: validCandidates.length,
      message: `Found ${validCandidates.length} quick candidates for preview`,
      note: 'This is a lightweight preview. Use POST /api/discover for full discovery.'
    })

  } catch (error) {
    console.error('Quick selection discovery error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error during quick discovery',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}