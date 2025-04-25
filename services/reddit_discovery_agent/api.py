from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import direct_openrouter
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(
    title="Reddit Discovery API",
    description="API for discovering relevant subreddits based on product type, problem area, and target audience",
    version="1.0.0"
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

@app.post("/discover", tags=["Subreddit Discovery"])
async def discover_subreddits(request: SubredditRequest):
    """
    Discover relevant subreddits based on product type, problem area, and target audience.
    """
    try:
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
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) 