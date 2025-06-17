#!/bin/bash

echo "🚀 Starting Enhanced Reddit Discovery Service..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Create a .env file with:"
    echo "OPENROUTER_API_KEY=your_key_here"
    echo "PERPLEXITY_API_KEY=your_key_here"
    echo "FIRECRAWL_API_KEY=your_key_here"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "📚 Installing requirements..."
pip install -r requirements.txt

# Start the service
echo "✅ Starting Enhanced Discovery Service on port 5001..."
echo "🌐 Health check: http://localhost:5001/enhanced-discover/health"
echo "📖 API docs: See README_ENHANCED.md for usage"
echo ""

python enhanced_api.py 