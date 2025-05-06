# Reddit Opportunity Engine

This tool helps entrepreneurs discover relevant Reddit communities (subreddits) for market research and product idea validation based on a defined focus area. It uses OpenRouter to access powerful AI models like Google's Gemini 2.5 Flash Preview, combined with direct Reddit API access to find and recommend the most relevant subreddits.

## Features

* Takes user input describing a product idea, problem area, and target audience
* Performs direct Reddit searches using Reddit's JSON API to find current information
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
* **Reliable Search Method**: Uses Reddit's own JSON API directly for higher reliability and more consistent results
* **Interactive Subreddit Selection**: Choose up to 8 subreddits from the results with an interactive UI
* **Gumloop API Integration**: Send selected subreddits directly to Gumloop for in-depth analysis

## Setup

### Local Setup

1. **Clone the Repository:**
   ```bash
   git clone <repository-url>
   cd reddit-opportunity-engine/services/reddit_discovery_agent
   ```

2. **Install Dependencies:**
   ```bash
   pip install openai python-dotenv rich aiohttp requests
   ```

3. **Configure Environment Variables:**
   * Create a `.env` file:
     ```bash
     touch .env
     ```
   * Add your API keys:
     ```
     # Required for AI functionality
     OPENROUTER_API_KEY="sk-or-v1-YOUR_ACTUAL_API_KEY_HERE"
     
     # Required for Gumloop integration
     GUMLOOP_API_KEY="your_gumloop_api_key"
     
     # Optional - defaults are provided
     GUMLOOP_USER_ID="your_user_id"
     GUMLOOP_SAVED_ITEM_ID="your_saved_item_id"
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
python search_agent.py \
  --product-type "Mobile game for casual players" \
  --problem-area "Player retention and monetization" \
  --target-audience "Casual mobile gamers age 25-45"
```

You can also run it with Docker:

```bash
docker-compose run --rm reddit-discovery-agent python search_agent.py \
  --product-type "Your product" \
  --problem-area "Your problem area" \
  --target-audience "Your target audience"
```

## Using the Interactive Selection UI

The new agent includes an interactive selection UI that allows you to:

1. View all discovered subreddits categorized by size (large, medium, niche)
2. Navigate through the list using up/down arrows (or j/k keys)
3. Select up to 8 subreddits using the spacebar
4. Confirm your selection with Enter
5. Provide your email address for receiving the analysis report
6. Send the selected subreddits to Gumloop for analysis

Navigation commands:
- **↑/k**: Move up the list
- **↓/j**: Move down the list
- **Space**: Toggle selection for the current subreddit
- **Enter**: Confirm your selection
- **q**: Quit/cancel selection

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
3. Performs Reddit API searches through their JSON API
4. Extracts and validates subreddits from search results
5. Sends the search results along with your parameters to the Gemini model via OpenRouter
6. Processes the response and returns structured recommendations

### New Agentic Implementation

The agentic implementation works in three main phases:

#### Phase 1: Search Agent

1. Starts with initial search queries based on user input
2. For each iteration:
   - Performs Reddit API searches to find relevant subreddits
   - Pre-filters obviously irrelevant subreddits using a banned list
   - Uses AI to screen subreddits for relevance (requiring 90+ relevance score)
   - Validates discovered subreddits (checking if they exist and meet subscriber thresholds)
   - Uses the "Think" tool to evaluate results quality
   - Dynamically generates new, more targeted search queries 
   - Continues until finding sufficient niche communities or reaching max iterations (minimum 3)

#### Phase 2: Selection & Analysis

1. Presents all validated subreddits in an interactive UI
2. User selects up to 8 subreddits for detailed analysis
3. Formats selection for the Gumloop API
4. Sends data for analysis (after user confirmation)

#### Phase 3: Gumloop Analysis

1. Gumloop receives the subreddit data along with product context
2. Performs in-depth analysis of posts and comments
3. Sends analysis report to the provided email address

## Response Format

The agentic implementation returns an enhanced JSON object:

```json
{
  "run_id": "abc123",
  "iterations": 3,
  "total_valid_subreddits": 15,
  "api_calls": 5,
  "categories": {
    "large_communities": [
      {
        "name": "r/example1",
        "title": "Example 1 Subreddit",
        "subscribers": 1500000,
        "description": "A community for...",
        "url": "https://www.reddit.com/r/example1",
        "created_utc": 1600000000,
        "is_niche": false,
        "active_users": 5000,
        "selection_reason": "This subreddit is relevant because..."
      }
    ],
    "medium_communities": [...],
    "niche_communities": [...]
  },
  "all_subreddits": [...]
}
```

## Modular Architecture

The new implementation uses a modular architecture for better maintainability:

- **search_agent.py**: Main implementation with search, validation, and interactive UI
- **reddit_search.py**: Contains Reddit search-specific functionalities
- **subreddit_utils.py**: Utilities for validating and enriching subreddit data
- **direct_openrouter.py**: Original implementation (for backward compatibility)
- **api.py**: FastAPI service for HTTP-based access

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
   In the Railway dashboard, add your environment variables:
   - `OPENROUTER_API_KEY` (required)
   - `GUMLOOP_API_KEY` (for Gumloop integration)
   - `GUMLOOP_USER_ID` (optional)
   - `GUMLOOP_SAVED_ITEM_ID` (optional)

5. **Run as a Service**:
   Update the service settings in Railway to run the container with:
   ```bash
   python search_agent.py
   ```
   