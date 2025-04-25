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

### With Default Parameters

```bash
python direct_openrouter.py
```

### With Custom Parameters

```bash
python direct_openrouter.py \
  --product-type "Mobile game for casual players" \
  --problem-area "Player retention and monetization" \
  --target-audience "Casual mobile gamers age 25-45" \
  --additional-context "Looking for communities that discuss game mechanics and player psychology"
```

You can also run it with Docker:

```bash
docker-compose run --rm reddit-discovery-agent python direct_openrouter.py \
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

1. The tool accepts parameters describing your product, problem area, and target audience
2. It generates dynamic search queries based on your input
3. Performs real-time web searches through DuckDuckGo
4. Sends the search results along with your parameters to the Gemini model via OpenRouter
5. Processes the response and returns structured recommendations

## Response Format

The tool returns a JSON object with:

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
  "search_suggestions": ["term1", "term2", "term3"]
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
   python direct_openrouter.py
   ```
   