# Reddit Discovery Agent API Usage

This document explains how to use the Reddit Discovery Agent API with streaming results from a Next.js frontend.

## API Endpoints

### Start a Search

```
POST /discover
```

**Request Body:**
```json
{
  "product_type": "Mobile game for casual players",
  "problem_area": "Player retention and monetization",
  "target_audience": "Casual mobile gamers age 25-45",
  "additional_context": "Looking for communities that discuss game mechanics"
}
```

**Response:**
```json
{
  "search_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "started"
}
```

### Get Search Status with Streaming Events

```
GET /search/{search_id}/status?last_event_index={last_event_index}
```

**Parameters:**
- `search_id`: The ID returned from the `/discover` endpoint
- `last_event_index`: The index of the last event you received (start with 0)

**Response:**
```json
{
  "search_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "running",
  "complete": false,
  "events": [
    {
      "type": "search_started",
      "data": {
        "run_id": "abcd1234",
        "product_type": "Mobile game for casual players",
        "problem_area": "Player retention and monetization",
        "target_audience": "Casual mobile gamers age 25-45"
      },
      "timestamp": 1627384025.123456
    },
    {
      "type": "query_executed",
      "data": {
        "query": "reddit communities for Mobile game for casual players"
      },
      "timestamp": 1627384026.654321
    }
  ],
  "progress": 0.15,
  "next_event_index": 2
}
```

### Get Final Results

```
GET /search/{search_id}/results
```

**Parameters:**
- `search_id`: The ID returned from the `/discover` endpoint

**Response:**
```json
{
  "search_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "validated_subreddits": [
    {
      "subreddit_name": "r/gamedev",
      "title": "Game Development",
      "subscribers": 550000,
      "public_description": "All things related to game development...",
      "created_utc": 1234567890,
      "over18": false,
      "active_user_count": 2500,
      "url": "https://www.reddit.com/r/gamedev/",
      "verified": true
    }
  ],
  "request": {
    "product_type": "Mobile game for casual players",
    "problem_area": "Player retention and monetization",
    "target_audience": "Casual mobile gamers age 25-45",
    "additional_context": "Looking for communities that discuss game mechanics"
  },
  "total_events": 35
}
```

## Next.js Integration

Here's how to integrate with your Next.js application:

### API Route for Proxying Requests (Optional)

If you want to hide your API keys or add authentication, create an API route in your Next.js app:

```typescript
// pages/api/discover.ts
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const response = await fetch('https://your-backend-url/discover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_KEY}`
      },
      body: JSON.stringify(req.body)
    })
    
    const data = await response.json()
    return res.status(response.status).json(data)
  } catch (error) {
    return res.status(500).json({ error: 'Failed to start search' })
  }
}
```

### React Component for Streaming Results

This component demonstrates how to start a search and stream results:

```tsx
// components/SubredditSearch.tsx
import { useState, useEffect } from 'react'

export default function SubredditSearch() {
  const [searchId, setSearchId] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [events, setEvents] = useState<any[]>([])
  const [lastEventIndex, setLastEventIndex] = useState(0)
  const [results, setResults] = useState<any[]>([])
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)

  // Start a new search
  const startSearch = async () => {
    setIsSearching(true)
    setError(null)
    setEvents([])
    setLastEventIndex(0)
    setProgress(0)
    setResults([])
    
    try {
      const response = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_type: 'Mobile game for casual players',
          problem_area: 'Player retention and monetization',
          target_audience: 'Casual mobile gamers age 25-45'
        })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setSearchId(data.search_id)
        // Start polling for updates
        startPolling(data.search_id)
      } else {
        setError(data.detail || 'Failed to start search')
        setIsSearching(false)
      }
    } catch (err) {
      setError('Network error')
      setIsSearching(false)
    }
  }
  
  // Poll for status updates
  const startPolling = (id: string) => {
    // Clear any existing interval
    if (pollingInterval) clearInterval(pollingInterval)
    
    const interval = setInterval(async () => {
      if (!id) return
      
      try {
        const response = await fetch(`/api/search/${id}/status?last_event_index=${lastEventIndex}`)
        const data = await response.json()
        
        if (response.ok) {
          // Add new events
          if (data.events.length > 0) {
            setEvents(prev => [...prev, ...data.events])
            setLastEventIndex(data.next_event_index)
          }
          
          // Update progress
          setProgress(data.progress)
          
          // Check if complete
          if (data.complete) {
            clearInterval(interval)
            setPollingInterval(null)
            fetchFinalResults(id)
          }
        } else {
          setError(data.detail || 'Error getting search status')
          clearInterval(interval)
          setPollingInterval(null)
          setIsSearching(false)
        }
      } catch (err) {
        setError('Network error')
        clearInterval(interval)
        setPollingInterval(null)
        setIsSearching(false)
      }
    }, 1000) // Poll every second
    
    setPollingInterval(interval)
  }
  
  // Fetch final results when complete
  const fetchFinalResults = async (id: string) => {
    try {
      const response = await fetch(`/api/search/${id}/results`)
      const data = await response.json()
      
      if (response.ok) {
        setResults(data.validated_subreddits || [])
        setIsSearching(false)
      } else {
        setError(data.detail || 'Error getting search results')
        setIsSearching(false)
      }
    } catch (err) {
      setError('Network error')
      setIsSearching(false)
    }
  }
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval)
    }
  }, [pollingInterval])
  
  return (
    <div className="search-container">
      <h1>Reddit Community Finder</h1>
      
      {!isSearching && !results.length && (
        <button onClick={startSearch} disabled={isSearching}>
          Find Relevant Subreddits
        </button>
      )}
      
      {error && <div className="error">{error}</div>}
      
      {isSearching && (
        <div className="search-progress">
          <h2>Searching for communities...</h2>
          <progress value={progress * 100} max="100" />
          <p>{Math.round(progress * 100)}% complete</p>
          
          <div className="events-stream">
            <h3>Search Progress</h3>
            <div className="events-container">
              {events.map((event, index) => (
                <div key={index} className={`event event-${event.type}`}>
                  {event.type === 'query_executed' && (
                    <p>Searching: {event.data.query}</p>
                  )}
                  {event.type === 'subreddit_validated' && event.data.status === 'valid' && (
                    <p>Found subreddit: {event.data.subreddit}</p>
                  )}
                  {event.type === 'thinking_complete' && (
                    <p>Analysis: {event.data.evaluation.substring(0, 100)}...</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {results.length > 0 && (
        <div className="results">
          <h2>Recommended Subreddits</h2>
          <ul className="subreddits-list">
            {results.map((subreddit, index) => (
              <li key={index} className="subreddit-card">
                <h3>{subreddit.subreddit_name}</h3>
                <p className="subscribers">{subreddit.subscribers.toLocaleString()} subscribers</p>
                <p className="description">{subreddit.public_description}</p>
                <a href={`https://reddit.com${subreddit.url}`} target="_blank" rel="noopener noreferrer">
                  Visit Subreddit
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

## Serverless Considerations

When deploying to Vercel or other serverless platforms, consider these adjustments:

1. **API Timeouts**: Serverless functions typically have a 10-30 second timeout. Your client needs to continue polling even if an individual request times out.

2. **Memory Usage**: The search process is memory-intensive. Configure your serverless functions with adequate memory.

3. **Stateless Operation**: Serverless functions should be stateless. The API implementation uses in-memory storage which won't work across function invocations in a serverless environment.

### Recommended Serverless Architecture

For truly serverless operation, make these changes:

1. Move the search state storage from in-memory to a database like MongoDB, Redis, or DynamoDB
2. Use a queue system like SQS or a task runner to manage the background processing
3. Break the search process into smaller functions that can complete within serverless time limits

Example serverless database integration:

```python
# Example modification to store search results in MongoDB instead of memory
from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient(os.environ.get("MONGODB_URI"))
db = client.reddit_discovery
searches_collection = db.searches

# Replace in-memory operations with database calls

# Instead of:
# search_results[search_id] = {...}

# Use:
searches_collection.insert_one({
    "_id": search_id,
    "status": "running",
    "events": [],
    "complete": False,
    "progress": 0.0,
    "timestamp": time.time(),
    "request": request.dict()
})

# Instead of fetching from memory:
# search_data = search_results[search_id]

# Use:
search_data = searches_collection.find_one({"_id": search_id})
```

## Event Types

The API emits various event types that you can use to create a rich, interactive experience:

- `search_started`: Initial search setup 
- `query_executed`: A search query is being run
- `search_results`: Results from a query
- `subreddit_found`: A potential subreddit mention found in search results
- `subreddit_validated`: A subreddit was checked for validity
- `iteration_started`: A new search iteration begins
- `iteration_complete`: A search iteration finished
- `thinking_started`: AI is evaluating results
- `thinking_complete`: AI finished evaluating results
- `search_complete`: The entire search is complete
- `ai_call_started`: An API call to the AI model is starting
- `ai_call_completed`: An API call to the AI model finished

You can use these events to create a detailed, engaging UI that shows exactly what's happening during the search process. 