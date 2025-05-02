from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from search_agent import SearchAgent
import asyncio
import json
import uuid
import time
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Optional, Any

app = FastAPI(title="Reddit Discovery Agent API", 
              description="API for finding relevant subreddits for product research")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for search results
search_results: Dict[str, Dict[str, Any]] = {}

# Model for the search request
class SearchRequest(BaseModel):
    product_type: str
    problem_area: str
    target_audience: str
    additional_context: Optional[str] = None

# Model for the search status response
class SearchStatusResponse(BaseModel):
    search_id: str
    status: str
    complete: bool
    events: List[Dict]
    progress: float
    validated_subreddits: Optional[List] = None
    next_event_index: int

# Clean up old searches periodically (24 hours)
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_old_searches())

async def cleanup_old_searches():
    while True:
        await asyncio.sleep(3600)  # Check every hour
        current_time = time.time()
        to_delete = []
        
        for search_id, data in search_results.items():
            # Delete searches older than 24 hours
            if current_time - data.get("timestamp", current_time) > 86400:
                to_delete.append(search_id)
                
        for search_id in to_delete:
            del search_results[search_id]

async def run_search(search_id: str, product_type: str, problem_area: str, target_audience: str, additional_context: Optional[str] = None):
    """Run the search agent in the background and store events and results."""
    search_data = search_results[search_id]
    
    # Initialize validated_subreddits in the search data
    search_data["validated_subreddits"] = []
    
    agent = SearchAgent(
        product_type=product_type,
        problem_area=problem_area,
        target_audience=target_audience,
        additional_context=additional_context
    )
    
    # Register event handlers for all event types
    for event_type in agent.callbacks.keys():
        def create_event_handler(event_type):
            def handler(data):
                search_data["events"].append({
                    "type": event_type,
                    "data": data,
                    "timestamp": time.time()
                })
                
                # Update progress based on event type
                if event_type == "iteration_complete":
                    iteration = data.get("iteration", 0)
                    search_data["progress"] = min(0.85, (iteration / agent.max_iterations) * 0.85)
                elif event_type == "thinking_complete":
                    search_data["progress"] = 0.9
                elif event_type == "search_complete":
                    search_data["progress"] = 1.0
                    search_data["complete"] = True
                    search_data["status"] = "complete"
                    search_data["validated_subreddits"] = data.get("validated_subreddits", [])
                
                # Add subreddits to validated_subreddits list as they're validated
                if event_type == "subreddit_validated" and data.get("status") == "valid":
                    metadata = data.get("metadata", {})
                    if metadata:
                        # Avoid duplicates by checking if this subreddit is already in the list
                        subreddit_name = metadata.get("subreddit_name", "").lower()
                        if subreddit_name and not any(sub.get("subreddit_name", "").lower() == subreddit_name 
                                                   for sub in search_data["validated_subreddits"]):
                            search_data["validated_subreddits"].append(metadata)
            
            return handler
            
        agent.register_callback(event_type, create_event_handler(event_type))
    
    try:
        # Start the search using the async run method
        await agent.run()
    except Exception as e:
        # Handle any exceptions
        search_data["status"] = "error"
        search_data["error"] = str(e)
        search_data["complete"] = True
        search_data["events"].append({
            "type": "error",
            "data": {"message": str(e)},
            "timestamp": time.time()
        })

@app.post("/discover", status_code=202)
async def start_search(request: SearchRequest, background_tasks: BackgroundTasks):
    """Start a new subreddit discovery search."""
    search_id = str(uuid.uuid4())
    
    # Initialize search data
    search_results[search_id] = {
        "status": "running",
        "events": [],
        "complete": False,
        "progress": 0.0,
        "timestamp": time.time(),
        "request": request.dict()
    }
    
    # Start the search in the background
    # Create a task directly with asyncio instead of using background_tasks
    # This gives us more control and allows for async operations
    asyncio.create_task(
        run_search(
            search_id,
            request.product_type,
            request.problem_area,
            request.target_audience,
            request.additional_context
        )
    )
    
    return {"search_id": search_id, "status": "started"}

@app.get("/search/{search_id}/status")
async def get_search_status(search_id: str, last_event_index: int = 0) -> SearchStatusResponse:
    """Get the current status of a search and any new events since last_event_index."""
    if search_id not in search_results:
        raise HTTPException(status_code=404, detail="Search not found")
    
    search_data = search_results[search_id]
    events = search_data["events"][last_event_index:] if last_event_index < len(search_data["events"]) else []
    
    # Extract recommendation information if available
    top_recommendations = []
    recommended_subreddits = {}
    
    # Search for thinking_complete events to get recommendations
    for event in reversed(search_data["events"]):
        if event["type"] == "thinking_complete":
            top_recommendations = event["data"].get("top_recommendations", [])
            break
    
    # Create a map of recommended subreddits with their reasons
    for rec in top_recommendations:
        subreddit_name = rec.get("subreddit_name", "").lower().strip()
        if subreddit_name:
            recommended_subreddits[subreddit_name] = {
                "reason": rec.get("reason", ""),
                "rank": len(recommended_subreddits) + 1
            }
    
    # Enhance validated subreddits with recommendation information
    validated_subreddits = search_data.get("validated_subreddits", [])
    enhanced_subreddits = []
    
    for sub in validated_subreddits:
        subreddit_name = sub.get("subreddit_name", "").lower().strip()
        sub_data = {**sub}  # Copy the original data
        
        # Add recommendation status if available
        is_recommended = subreddit_name in recommended_subreddits
        sub_data["is_recommended"] = is_recommended
        
        if is_recommended:
            sub_data["recommendation_reason"] = recommended_subreddits[subreddit_name]["reason"]
            sub_data["recommendation_rank"] = recommended_subreddits[subreddit_name]["rank"]
        
        enhanced_subreddits.append(sub_data)
    
    # Sort by recommendation status, rank, and subscribers
    if enhanced_subreddits:
        enhanced_subreddits.sort(
            key=lambda x: (
                -1 if x.get("is_recommended", False) else 1,  # Recommended first
                x.get("recommendation_rank", 999),             # Then by rank
                -x.get("subscribers", 0)                       # Then by subscriber count (descending)
            )
        )
    
    return SearchStatusResponse(
        search_id=search_id,
        status=search_data["status"],
        complete=search_data["complete"],
        events=events,
        progress=search_data["progress"],
        validated_subreddits=enhanced_subreddits,
        next_event_index=last_event_index + len(events)
    )

@app.get("/search/{search_id}/results")
async def get_search_results(search_id: str):
    """Get the final results of a completed search."""
    if search_id not in search_results:
        raise HTTPException(status_code=404, detail="Search not found")
    
    search_data = search_results[search_id]
    
    if not search_data["complete"]:
        raise HTTPException(status_code=202, detail="Search still in progress")
    
    if search_data["status"] == "error":
        raise HTTPException(status_code=500, detail=search_data.get("error", "Unknown error"))
    
    # Process validated subreddits to include recommendation status
    validated_subreddits = search_data.get("validated_subreddits", [])
    
    # Extract top recommendations from the thinking events if available
    top_recommendations = []
    recommended_subreddits = {}
    
    # Find the most recent thinking_complete event to get recommendations
    for event in reversed(search_data["events"]):
        if event["type"] == "thinking_complete":
            top_recommendations = event["data"].get("top_recommendations", [])
            break
    
    # Create a map of recommended subreddits with their reasons
    for rec in top_recommendations:
        subreddit_name = rec.get("subreddit_name", "").lower().strip()
        if subreddit_name:
            recommended_subreddits[subreddit_name] = {
                "reason": rec.get("reason", ""),
                "rank": len(recommended_subreddits) + 1  # Assign ranking based on order
            }
    
    # Enhance validated subreddit data with recommendation information
    enhanced_subreddits = []
    for sub in validated_subreddits:
        subreddit_name = sub.get("subreddit_name", "").lower().strip()
        sub_data = {**sub}  # Copy the original data
        
        # Add recommendation status
        is_recommended = subreddit_name in recommended_subreddits
        sub_data["is_recommended"] = is_recommended
        
        if is_recommended:
            sub_data["recommendation_reason"] = recommended_subreddits[subreddit_name]["reason"]
            sub_data["recommendation_rank"] = recommended_subreddits[subreddit_name]["rank"]
        
        # Ensure these fields exist and are properly formatted
        sub_data["subscribers"] = sub.get("subscribers", 0)
        sub_data["title"] = sub.get("title", "")
        sub_data["public_description"] = sub.get("public_description", "")
        sub_data["created_utc"] = sub.get("created_utc", 0)
        sub_data["over18"] = sub.get("over18", False)
        
        enhanced_subreddits.append(sub_data)
    
    # Sort by recommendation rank first, then by subscriber count
    enhanced_subreddits.sort(
        key=lambda x: (
            -1 if x.get("is_recommended", False) else 1,  # Recommended first
            x.get("recommendation_rank", 999),             # Then by rank
            -x.get("subscribers", 0)                       # Then by subscriber count (descending)
        )
    )
    
    return {
        "search_id": search_id,
        "validated_subreddits": enhanced_subreddits,
        "recommended_subreddits": [sub for sub in enhanced_subreddits if sub.get("is_recommended", False)],
        "request": search_data.get("request"),
        "total_events": len(search_data["events"]),
        "search_time": time.time() - search_data.get("timestamp", time.time())
    }

@app.get("/healthcheck")
async def healthcheck():
    """API health check endpoint."""
    return {"status": "ok", "version": "1.0.0", "active_searches": len(search_results)}

# Run with: uvicorn api:app --reload
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True) 