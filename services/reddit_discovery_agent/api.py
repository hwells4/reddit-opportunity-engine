from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import direct_openrouter
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import agentic_reddit_finder

app = FastAPI(
    title="Reddit Discovery API",
    description="API for discovering relevant subreddits based on product type, problem area, and target audience",
    version="1.1.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

class SubredditRequest(BaseModel):
    product_type: Optional[str] = None
    problem_area: Optional[str] = None
    target_audience: Optional[str] = None
    additional_context: Optional[str] = None
    use_agentic: Optional[bool] = True  # Default to using the new agentic implementation

@app.post("/discover", tags=["Subreddit Discovery"])
async def discover_subreddits(request: SubredditRequest):
    """
    Discover relevant subreddits based on product type, problem area, and target audience.
    
    - **use_agentic**: Set to true to use the new agentic implementation with improved niche discovery (default),
                       or false to use the original implementation
    """
    try:
        if request.use_agentic:
            # Use the new agentic implementation
            result = agentic_reddit_finder.run_agentic_finder(
                product_type=request.product_type,
                problem_area=request.problem_area,
                target_audience=request.target_audience,
                additional_context=request.additional_context
            )
        else:
            # Use the original implementation
            result = direct_openrouter.run_subreddit_finder(
                product_type=request.product_type,
                problem_area=request.problem_area,
                target_audience=request.target_audience,
                additional_context=request.additional_context
            )
        
        if not result:
            raise HTTPException(
                status_code=500, 
                detail="Failed to get recommendations from the model"
            )
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/healthcheck", tags=["Health"])
async def health_check():
    """
    Simple health check endpoint.
    """
    return {"status": "healthy", "version": "1.1.0"}

@app.get("/about", tags=["Info"])
async def about():
    """
    Get information about the API and available implementations.
    """
    return {
        "name": "Reddit Discovery API",
        "version": "1.1.0",
        "implementations": {
            "original": {
                "description": "The original implementation that performs web searches and extracts subreddits",
                "features": ["Web search", "Subreddit validation", "AI recommendations"]
            },
            "agentic": {
                "description": "Enhanced implementation with agentic loop and niche subreddit discovery",
                "features": [
                    "Iterative search loop",
                    "AI-generated search queries",
                    "Think tool for self-evaluation",
                    "Niche community prioritization",
                    "Enhanced metadata"
                ]
            }
        }
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) 