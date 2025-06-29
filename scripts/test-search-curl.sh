#!/bin/bash

# Test the search API with curl

echo "🔍 Testing Search API..."
echo ""
echo "Make sure the dev server is running (npm run dev)"
echo ""

# Test payload
read -r -d '' PAYLOAD << 'EOF'
{
  "audience": "DevOps engineers working with Kubernetes",
  "questions": [
    "What challenges do they face with pod scheduling?",
    "How do they handle resource limits and quotas?"
  ],
  "maxPosts": 10,
  "ageDays": 14,
  "minScore": 5
}
EOF

echo "Request payload:"
echo "$PAYLOAD" | jq .
echo ""

echo "Sending request to http://localhost:3000/api/search..."
echo ""

# Make the request
RESPONSE=$(curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Check if request was successful
if [ $? -eq 0 ]; then
  echo "✅ Response received:"
  echo ""
  echo "$RESPONSE" | jq .
  
  # Extract some stats
  RUN_ID=$(echo "$RESPONSE" | jq -r '.runId')
  POST_COUNT=$(echo "$RESPONSE" | jq -r '.posts | length')
  RAW_FETCHED=$(echo "$RESPONSE" | jq -r '.stats.rawFetched')
  
  echo ""
  echo "📊 Summary:"
  echo "  - Run ID: $RUN_ID"
  echo "  - Posts returned: $POST_COUNT"
  echo "  - Raw posts fetched: $RAW_FETCHED"
else
  echo "❌ Request failed"
fi