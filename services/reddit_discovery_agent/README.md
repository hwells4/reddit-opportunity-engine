# Reddit Opportunity Engine

This tool helps entrepreneurs discover relevant Reddit communities (subreddits) for market research and product idea validation based on a defined focus area. It uses OpenRouter to access powerful AI models like Google's Gemini 2.5 Flash Preview, combined with real-time DuckDuckGo search to find and recommend the most relevant subreddits.

## Features

* Takes user input describing a product idea, problem area, and target audience
* Performs real-time web searches using DuckDuckGo to find current information
* Returns a structured list of 3-5 recommended subreddits with details:
  * Name (r/...)
  * Approximate Subscriber Count
  * Relevance Explanation
  * Typical Content Type
  * Audience Alignment
* Suggests specific search terms for use within those subreddits

### New Agentic Features 🚀

* **Agentic Search Loop**: Continues searching until finding high-quality, niche subreddits
* **"Think" Tool**: Self-evaluates search progress and adjusts strategy
* **Search Query Generation**: AI dynamically generates search queries based on previous results
* **Niche Community Focus**: Prioritizes smaller, more focused communities over general ones
* **Standard Output Format**: Enhanced metadata for better frontend display

## Setup

### Local Setup

1. **Clone the Repository:**
   ```bash
   git clone <repository-url>
   cd reddit-opportunity-engine/services/reddit_discovery_agent
   ```

2. **Install Dependencies:**
   ```bash
   pip install openai duckduckgo-search python-dotenv rich
   ```

3. **Configure Environment Variables:**
   * Create a `.env` file:
     ```bash
     touch .env
     ```
   * Add your OpenRouter API key (get one from https://openrouter.ai/keys):
     ```
     OPENROUTER_API_KEY="sk-or-v1-YOUR_ACTUAL_API_KEY_HERE"
     ```

### Docker Setup

1. **Build and Run with Docker:**
   ```bash
   docker-compose build
   docker-compose up
   ```

## Running the Agent

### Original Implementation

```bash
python direct_openrouter.py \
  --product-type "Mobile game for casual players" \
  --problem-area "Player retention and monetization" \
  --target-audience "Casual mobile gamers age 25-45"
```

### New Agentic Implementation

```bash
python agentic_reddit_finder.py \
  --product-type "Mobile game for casual players" \
  --problem-area "Player retention and monetization" \
  --target-audience "Casual mobile gamers age 25-45" \
  --output-file "results.json"
```

You can also run it with Docker:

```bash
docker-compose run --rm reddit-discovery-agent python agentic_reddit_finder.py \
  --product-type "Your product" \
  --problem-area "Your problem area" \
  --target-audience "Your target audience"
```

## Using the API Service

The project also includes a FastAPI-based API service for integration with other applications.

### Starting the API Server

```bash
uvicorn api:app --host 0.0.0.0 --port 8000
```

Or with Docker:

```bash
docker-compose up reddit-discovery-api
```

### API Endpoints

1. **POST /discover**

   Request body:
   ```json
   {
     "product_type": "Mobile game for casual players",
     "problem_area": "Player retention and monetization",
     "target_audience": "Casual mobile gamers age 25-45",
     "additional_context": "Looking for communities that discuss game mechanics"
   }
   ```

2. **GET /healthcheck**

   Returns the health status of the API.

The API includes automatic Swagger documentation at `http://localhost:8000/docs`.

## How It Works

### Original Implementation

1. The tool accepts parameters describing your product, problem area, and target audience
2. It generates static search queries based on your input
3. Performs real-time web searches through DuckDuckGo
4. Extracts and validates subreddits from search results
5. Sends the search results along with your parameters to the Gemini model via OpenRouter
6. Processes the response and returns structured recommendations

### New Agentic Implementation

The agentic implementation works in two main phases with a feedback loop:

#### Phase 1: Search Agent

1. Starts with initial search queries based on user input
2. For each iteration:
   - Performs web searches to find relevant subreddits
   - Validates discovered subreddits
   - Uses the "Think" tool to evaluate results quality
   - Dynamically generates new, more targeted search queries 
   - Continues until finding sufficient niche communities or reaching max iterations

#### Phase 2: Recommendation Agent

1. Takes the validated subreddits from the search agent
2. Prioritizes smaller, niche communities (under 500K subscribers)
3. Generates final recommendations with detailed metadata
4. Provides search term suggestions and insights

## Response Format

The agentic implementation returns an enhanced JSON object:

```json
{
  "subreddit_recommendations": [
    {
      "subreddit_name": "r/example",
      "subscriber_count": "100k",
      "relevance_explanation": "This subreddit is relevant because...",
      "content_type": "Discussions, project showcases, etc.",
      "audience_alignment": "The audience consists of..."
    }
  ],
  "search_suggestions": ["term1", "term2", "term3"],
  "search_insights": "Analysis of why these recommendations are valuable...",
  "metadata": {
    "run_id": "abc123",
    "search_iterations": 2,
    "total_subreddits_found": 25,
    "validated_subreddits_count": 18,
    "execution_time_seconds": 45.2,
    "timestamp": "2023-07-22 14:30:15"
  }
}
```

## Deploying to Railway

1. **Install Railway CLI** (if not already installed):
   ```bash
   npm i -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Initialize and Deploy**:
   ```bash
   cd services/reddit_discovery_agent
   railway init
   railway up
   ```

4. **Set Environment Variables**:
   In the Railway dashboard, add your `OPENROUTER_API_KEY` as an environment variable.

5. **Run as a Service**:
   Update the service settings in Railway to run the container with:
   ```bash
   python agentic_reddit_finder.py  # Use new agentic implementation
   ```
   
## Architecture

### Components

- **agentic_reddit_finder.py**: Main entry point that orchestrates the overall process
- **search_agent.py**: Handles the iterative discovery of subreddits with self-evaluation
- **recommendation_agent.py**: Processes validated subreddits to produce final recommendations
- **subreddit_utils.py**: Utilities for validating and enriching subreddit data
- **direct_openrouter.py**: Original implementation (for backward compatibility)
- **api.py**: FastAPI service for HTTP-based access
   