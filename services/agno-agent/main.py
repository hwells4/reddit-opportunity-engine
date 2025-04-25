from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import agno
import os

# Initialize FastAPI app
app = FastAPI(title="Agno Agent Service")

# Initialize Agno - you'd add your specific configuration here
# Uncomment and modify as needed based on your Agno requirements
# agno.api_key = os.environ.get("AGNO_API_KEY")

class AgentRequest(BaseModel):
    query: str
    context: dict = {}

class AgentResponse(BaseModel):
    result: str
    metadata: dict = {}

@app.get("/")
async def root():
    return {"status": "healthy", "service": "agno-agent"}

@app.post("/agent", response_model=AgentResponse)
async def run_agent(request: AgentRequest):
    try:
        # This is where you would implement your Agno agent logic
        # For example:
        # result = your_agno_agent.process(request.query, request.context)
        
        # Placeholder response - replace with actual implementation
        result = f"Processed: {request.query}"
        metadata = {"processed": True}
        
        return AgentResponse(result=result, metadata=metadata)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 