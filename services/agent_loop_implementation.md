# Agent Loop & Think Tool Implementation Blueprint

## Overview
This document outlines the technical approach for implementing an agentic loop with a "Think" tool capability for the Reddit Opportunity Engine. These enhancements will enable the agent to continually refine its search results until it finds high-quality, niche subreddit recommendations.

## Agent Loop Architecture

### Core Components

1. **Controller**: Orchestrates the entire agent loop workflow
2. **Search Engine**: Enhances web search capabilities with refined queries
3. **Evaluator**: Assesses the quality of discovered subreddits
4. **Think Tool**: Provides introspection and decision-making capabilities
5. **Memory**: Maintains state between iterations to avoid duplicates

### Workflow Sequence

```
┌─────────────────┐           ┌───────────────┐
│  Initial Input  │           │  Search Query │
│  & Parameters   │───────────▶  Generation   │
└─────────────────┘           └───────┬───────┘
                                      │
                                      ▼
┌─────────────────┐           ┌───────────────┐
│     Return      │           │  Web Search   │
│  Final Results  │◀──────────│  Execution    │
└─────────────────┘   Yes     └───────┬───────┘
        ▲                            │
        │                            ▼
┌───────┴───────┐            ┌───────────────┐
│   Sufficient  │            │   LLM-based   │
│   Results?    │◀───────────│   Analysis    │
└───────────────┘    No      └───────┬───────┘
        │                            │
        ▼                            ▼
┌─────────────────┐           ┌───────────────┐
│  Think: Refine  │           │   Evaluate    │
│  Search Strategy│           │   Results     │
└────────┬────────┘           └───────────────┘
         │
         ▼
┌─────────────────┐
│  Generate New   │
│  Search Queries │
└─────────────────┘
```

## Think Tool Implementation

The Think tool will enable the agent to:

1. **Analyze Current Results**:
   - Identify which subreddits are too general (e.g., r/AskReddit)
   - Determine if discovered subreddits are relevant to user's inputs
   - Assess diversity of recommendations (avoiding similar communities)

2. **Generate Search Refinements**:
   - Create more specific search terms based on initial findings
   - Identify under-explored aspects of the user's query
   - Tailor searches to find more niche communities

3. **Make Strategic Decisions**:
   - Determine whether to continue searching or return results
   - Decide which aspects of the user's query to prioritize
   - Balance breadth vs. depth in the search process

### Technical Implementation

```python
def think(current_results, search_history, user_inputs):
    """
    Analyze current search results and determine next actions.
    
    Args:
        current_results: List of subreddit recommendations found so far
        search_history: Previous search queries and their results
        user_inputs: Original user parameters (product, problem, audience, context)
        
    Returns:
        dict: Analysis and decision package with:
            - assessment: Evaluation of current results
            - decision: Continue searching or return results
            - next_queries: If continuing, new search queries to try
            - reasoning: Explanation of the thinking process
    """
    # Prepare prompt for the LLM to analyze results
    prompt = f"""
    You are analyzing the current state of a subreddit discovery process.
    
    Original User Inputs:
    - Product: {user_inputs['product_type']}
    - Problem: {user_inputs['problem_area']}
    - Audience: {user_inputs['target_audience']}
    - Context: {user_inputs['additional_context']}
    
    Current Results:
    {format_results(current_results)}
    
    Search History:
    {format_search_history(search_history)}
    
    Please analyze the following:
    1. Quality Assessment: Evaluate how relevant and niche each subreddit is (0-10 scale)
    2. Gaps Analysis: Identify aspects of the user's needs not yet addressed
    3. Decision: Should we continue searching or are results sufficient?
    4. If continuing, suggest 3 specific new search queries to try
    5. Reasoning: Explain your analysis and decision
    
    Format your response as a JSON object.
    """
    
    # Make the API call
    response = call_llm_with_json_response(prompt)
    
    return response
```

## Enhanced Agent Loop Pseudocode

```python
def run_subreddit_finder_with_agent_loop(product_type, problem_area, target_audience, additional_context, 
                                         min_subreddits=5, max_iterations=3, quality_threshold=7):
    """Enhanced subreddit finder with agent loop and thinking capability."""
    
    # Initialize state
    inputs = prepare_inputs(product_type, problem_area, target_audience, additional_context)
    search_queries = generate_initial_queries(inputs)
    all_search_results = []
    current_recommendations = []
    search_history = []
    iterations = 0
    
    # Start agent loop
    while iterations < max_iterations:
        iterations += 1
        
        # Generate and execute searches
        new_results = []
        for query in search_queries:
            results = search_web(query)
            new_results.extend(results)
            search_history.append({"query": query, "results_count": len(results)})
        
        all_search_results.extend(new_results)
        
        # Analyze results with LLM
        recommendations = analyze_search_results(all_search_results, inputs)
        current_recommendations = recommendations
        
        # Evaluate results
        evaluation = evaluate_recommendations(current_recommendations, inputs)
        
        # Check if we have sufficient high-quality results
        if (len(current_recommendations["subreddit_recommendations"]) >= min_subreddits and 
            evaluation["average_quality"] >= quality_threshold):
            break
            
        # Think: Analyze and refine strategy
        think_result = think(current_recommendations, search_history, inputs)
        
        # If the thinking suggests we should stop, break
        if think_result["decision"] == "stop":
            break
            
        # Otherwise, update search queries based on thinking
        search_queries = think_result["next_queries"]
    
    # Add metadata
    final_result = {
        **current_recommendations,
        "metadata": {
            "iterations": iterations,
            "total_searches": len(search_history),
            "search_time_seconds": search_time,
            "quality_score": evaluation["average_quality"],
            "thinking_process": [think_result["reasoning"]]
        }
    }
    
    return final_result
```

## Enhanced Models for Frontend Integration

```python
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class SubredditRecommendation(BaseModel):
    """Enhanced subreddit recommendation with quality metrics."""
    subreddit_name: str = Field(..., description="The full name of the subreddit, starting with r/")
    subscriber_count: Optional[str] = Field(None, description="Approximate subscriber count")
    relevance_explanation: str = Field(..., description="Why this subreddit is relevant")
    content_type: str = Field(..., description="Typical content types found")
    audience_alignment: str = Field(..., description="How the audience aligns with target audience")
    quality_score: float = Field(..., description="Internal quality score (0-10)")
    niche_score: float = Field(..., description="How niche/specific the community is (0-10)")
    
class SearchMetadata(BaseModel):
    """Metadata about the search process."""
    iterations: int = Field(..., description="Number of search iterations performed")
    total_searches: int = Field(..., description="Total number of search queries executed")
    search_time_seconds: float = Field(..., description="Total time taken for the search")
    quality_score: float = Field(..., description="Average quality score of recommendations")
    thinking_process: Optional[List[str]] = Field(None, description="Agent's reasoning during search")

class EnhancedSubredditOutput(BaseModel):
    """Enhanced output model with metadata for frontend integration."""
    subreddit_recommendations: List[SubredditRecommendation] = Field(
        ..., 
        description="List of subreddit recommendations",
        min_length=3
    )
    search_suggestions: List[str] = Field(
        ...,
        description="Search term suggestions for use within the subreddits"
    )
    metadata: SearchMetadata = Field(
        ...,
        description="Metadata about the search process"
    )
```

## Integration with Existing Code

The implementation will:

1. Wrap the current `run_subreddit_finder` function within the new agent loop
2. Preserve existing functionality while adding the looping and thinking capabilities
3. Enhance output models to include quality metrics and search metadata
4. Add appropriate logging for observability of the agent's thinking process

## Performance Considerations

To maintain reasonable performance (15-20 second target):

1. Implement asyncio for parallel web searches
2. Cache search results between iterations
3. Implement early termination if high-quality results are found
4. Use smaller LLM models for the Think tool compared to final analysis
5. Set strict token limits for prompts and responses

## Next Steps

1. Implement the core agent loop controller
2. Develop the Think tool function
3. Create enhanced evaluation metrics for subreddits
4. Update output models for frontend compatibility
5. Add performance optimizations
6. Test with various inputs to verify robustness 