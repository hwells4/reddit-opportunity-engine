# 🚀 Enhanced Reddit Discovery Agent

**Status: ✅ PRODUCTION READY**  
**Latest Update: Model upgrades to o3/o4-mini and Claude 3.5 Sonnet**

## 🎯 **What This Does**

The Enhanced Reddit Discovery Agent uses multiple AI models and data sources to intelligently discover relevant subreddits for your business, going far beyond simple keyword searching.

### **🔥 Key Advantages Over Traditional Discovery:**

1. **🧠 Multi-AI Intelligence**:
   - **OpenAI o3/o4-mini**: Latest reasoning models for complex analysis
   - **Claude 3.5 Sonnet**: Advanced subreddit categorization and recommendations
   - **Perplexity AI**: Real-time Reddit community research
   - **Firecrawl**: Comprehensive Reddit content search

2. **📊 Intelligent Discovery Process**:
   - AI generates targeted search queries based on your product/audience
   - Discovers communities you'd never find manually
   - Analyzes community culture and engagement patterns
   - Provides strategic engagement recommendations

3. **🎪 Categorized Results**:
   - **Primary**: Direct target audience, highest relevance
   - **Secondary**: Broader audience, good potential
   - **Niche**: Specific use cases, highly engaged

## 🛠️ **Setup Instructions**

### **1. Install Dependencies**
```bash
cd services/reddit_discovery_agent
pip install -r requirements.txt
```

### **2. Configure API Keys**
Create a `.env` file with these keys:

```env
# Required for Enhanced Discovery
OPENROUTER_API_KEY=your_openrouter_key_here
PERPLEXITY_API_KEY=your_perplexity_key_here
FIRECRAWL_API_KEY=your_firecrawl_key_here

# Optional: Custom endpoints
OLLAMA_BASE_URL=http://localhost:11434/api
```

### **3. Start the Enhanced Service**
```bash
# Use the convenient startup script
./start_enhanced_service.sh

# OR run manually:
python enhanced_api.py
```

The service will start on `http://localhost:5001`

### **4. Verify Everything Works**
```bash
# Health check
curl http://localhost:5001/enhanced-discover/health

# Test discovery
curl -X POST http://localhost:5001/enhanced-discover \
  -H "Content-Type: application/json" \
  -d '{
    "product_type": "Virtual organizing services",
    "problem_area": "Home clutter and disorganization", 
    "target_audience": "Busy professionals and parents",
    "additional_context": "Offers virtual consultations and courses"
  }'
```

## 🎮 **How to Use**

### **From Next.js Frontend**
The enhanced discovery is now the **default method** in your Reddit Analyzer form. Just toggle "Enhanced AI Discovery" (which is on by default) and submit.

### **From API**
```javascript
const response = await fetch('/api/enhanced-subreddit-discovery', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    product_type: "Your product description",
    problem_area: "What problem you solve",
    target_audience: "Who your ideal customers are",
    additional_context: "Any extra context about your business"
  })
});
```

### **Direct Python Usage**
```python
from enhanced_search_agent import EnhancedSearchAgent

agent = EnhancedSearchAgent(
    product_type="Virtual organizing services",
    problem_area="Home clutter and disorganization",
    target_audience="Busy professionals and parents"
)

results = await agent.discover_subreddits()
agent.display_results(results)
```

## 🤖 **AI Models Used**

### **Primary Analysis Models** (with fallback):
1. **OpenAI o3** - Latest reasoning model for complex analysis
2. **OpenAI o4-mini** - Fast, cost-effective for recommendations  
3. **Claude 3.5 Sonnet** - Advanced community analysis
4. **GPT-4 Turbo** - Reliable fallback

### **Research Models**:
- **Perplexity Sonar Large** - Real-time Reddit research
- **Firecrawl API** - Comprehensive content search

## 📊 **Expected Results**

For a typical business, you should expect:

- **5-15 Primary subreddits** (highest relevance)
- **10-20 Secondary subreddits** (good potential)  
- **5-10 Niche subreddits** (specific use cases)
- **Detailed engagement strategies** for each community
- **Quality analysis** of community culture and moderation

## 🔧 **Integration Status**

✅ **Enhanced Discovery API** (`/enhanced-discover`)  
✅ **Next.js API Integration** (`/api/enhanced-subreddit-discovery`)  
✅ **Frontend Integration** (Enhanced toggle in form)  
✅ **Model Fallback System** (Handles API failures gracefully)  
✅ **Health Monitoring** (`/enhanced-discover/health`)  

## 🚨 **Troubleshooting**

### **Service Won't Start**
```bash
# Check if .env file exists and has all required keys
cat .env

# Verify Python dependencies
pip install -r requirements.txt

# Check port availability
lsof -i :5001
```

### **API Key Issues**
- **OPENROUTER_API_KEY**: Get from https://openrouter.ai/
- **PERPLEXITY_API_KEY**: Get from https://www.perplexity.ai/
- **FIRECRAWL_API_KEY**: Get from https://firecrawl.dev/

### **Model Fallback Behavior**
The system tries models in this order:
1. OpenAI o3 → 2. o4-mini → 3. Claude 3.5 → 4. GPT-4 Turbo

If all fail, you'll get an error message with details.

## 🆚 **Enhanced vs Traditional Discovery**

| Feature | Traditional | Enhanced |
|---------|-------------|----------|
| **Intelligence** | Keyword search | Multi-AI analysis |
| **Discovery Sources** | 1 (Google search) | 3 (Perplexity + Firecrawl + AI) |
| **Analysis Depth** | Basic validation | Community culture analysis |
| **Recommendations** | None | Strategic engagement plans |
| **Quality Scoring** | Subscriber count only | AI-powered relevance scoring |
| **Result Categories** | Size-based only | Relevance-based (Primary/Secondary/Niche) |

## 🎉 **Ready to Use!**

Your enhanced discovery system is now fully configured with the latest AI models and ready to find the perfect Reddit communities for your business! 