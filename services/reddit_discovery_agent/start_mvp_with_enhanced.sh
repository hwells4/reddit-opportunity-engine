#!/bin/bash

echo "🚀 Starting Enhanced Reddit Discovery MVP Flow..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Create a .env file with:"
    echo "OPENROUTER_API_KEY=your_key_here"
    echo "PERPLEXITY_API_KEY=your_key_here"
    echo "FIRECRAWL_API_KEY=your_key_here"
    exit 1
fi

# Start enhanced service in background if not already running
if ! curl -s http://localhost:5001/enhanced-discover/health > /dev/null; then
    echo "🔧 Starting enhanced discovery service..."
    python3 enhanced_api.py &
    ENHANCED_PID=$!
    echo "Enhanced service started with PID: $ENHANCED_PID"
    
    # Wait for service to be ready
    echo "⏳ Waiting for enhanced service to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:5001/enhanced-discover/health > /dev/null; then
            echo "✅ Enhanced service is ready!"
            break
        fi
        sleep 1
    done
    
    if [ $i -eq 30 ]; then
        echo "❌ Enhanced service failed to start"
        kill $ENHANCED_PID 2>/dev/null
        exit 1
    fi
else
    echo "✅ Enhanced service already running"
fi

# Run MVP flow
echo "🎯 Starting MVP flow with enhanced discovery..."
python3 mvp_flow.py

# Clean up if we started the service
if [ ! -z "$ENHANCED_PID" ]; then
    echo "🧹 Cleaning up enhanced service..."
    kill $ENHANCED_PID 2>/dev/null
fi

echo "🎉 MVP flow complete!" 