# Agno Agent Service

A Python service using Agno framework to provide AI agent capabilities for the Reddit Opportunity Engine.

## Setup

1. Install Docker and Docker Compose
2. Create a `.env` file with your Agno API key:
   ```
   AGNO_API_KEY=your_agno_api_key_here
   ```
3. Start the service:
   ```
   docker-compose up -d
   ```

## Development

- The service runs on port 8000
- API endpoint: `POST /agent` accepts JSON with `query` and optional `context`
- Health check: `GET /`

## Integration with Next.js

From your Next.js application, you can call this service using standard fetch calls:

```typescript
// Example API call
const response = await fetch('http://localhost:8000/agent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'Your query here',
    context: { /* Optional context */ }
  }),
});

const data = await response.json();
```

For production, you would deploy this service separately and update the endpoint URL accordingly. 