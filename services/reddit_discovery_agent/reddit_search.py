import os
import random
import asyncio
import aiohttp
import logging
from rich.console import Console

# Setup console for better output
console = Console()

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# User agent rotation for Reddit requests
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:94.0) Gecko/20100101 Firefox/94.0'
]

# Fallback subreddits if all searches fail
FALLBACK_SUBREDDITS = [
    "r/startups", "r/Entrepreneur", "r/SaaS", "r/marketing", "r/smallbusiness", 
    "r/webdev", "r/productmanagement", "r/business", "r/copywriting",
    "r/sideproject", "r/programming", "r/growmybusiness", "r/dataisbeautiful"
]

async def search_reddit_json(query: str) -> list:
    """Search Reddit directly using their JSON API for search"""
    url = "https://www.reddit.com/search.json"
    params = {
        "q": query,
        "sort": "relevance",
        "t": "all",
        "limit": 25,
        "raw_json": 1
    }
    
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "application/json"
    }
    
    console.print(f"Searching Reddit JSON API for: {query}")
    logger.info(f"Searching Reddit JSON API for: {query}")
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, params=params, headers=headers, timeout=15) as response:
                if response.status != 200:
                    console.print(f"[yellow]Error: Reddit search returned status {response.status}[/yellow]")
                    logger.warning(f"Error: Reddit search returned status {response.status}")
                    return []
                
                data = await response.json()
                
                # Extract subreddit mentions from the JSON response
                subreddits = set()
                
                # Process the search results
                if "data" in data and "children" in data["data"]:
                    for post in data["data"]["children"]:
                        post_data = post.get("data", {})
                        
                        # Get the subreddit from the post data
                        if "subreddit_name_prefixed" in post_data:
                            subreddits.add(post_data["subreddit_name_prefixed"])
                        elif "subreddit" in post_data:
                            subreddits.add(f"r/{post_data['subreddit']}")
                
                subreddit_list = list(subreddits)
                console.print(f"Found {len(subreddit_list)} subreddits via Reddit JSON API")
                logger.info(f"Found {len(subreddit_list)} subreddits via Reddit JSON API")
                return subreddit_list
                
        except Exception as e:
            console.print(f"[bold red]Error in Reddit search: {str(e)}[/bold red]")
            logger.error(f"Error in Reddit search: {str(e)}")
            return []

async def search_top_subreddits(query: str) -> list:
    """Get top subreddits from Reddit's directory"""
    url = "https://www.reddit.com/subreddits.json"
    
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "application/json"
    }
    
    console.print(f"Getting popular subreddits related to: {query}")
    logger.info(f"Getting popular subreddits related to: {query}")
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, headers=headers, timeout=15) as response:
                if response.status != 200:
                    console.print(f"[yellow]Error: Subreddit directory returned status {response.status}[/yellow]")
                    logger.warning(f"Error: Subreddit directory returned status {response.status}")
                    return []
                
                data = await response.json()
                
                # Extract subreddits from the directory
                subreddits = set()
                
                # Process the results
                if "data" in data and "children" in data["data"]:
                    for subreddit in data["data"]["children"]:
                        subreddit_data = subreddit.get("data", {})
                        
                        # Only include relevant subreddits based on query terms
                        name = subreddit_data.get("display_name", "")
                        title = subreddit_data.get("title", "")
                        description = subreddit_data.get("public_description", "")
                        
                        # Simple relevance check
                        combined_text = (name + " " + title + " " + description).lower()
                        query_terms = query.lower().split()
                        
                        if any(term in combined_text for term in query_terms):
                            subreddits.add(f"r/{name}")
                
                subreddit_list = list(subreddits)
                console.print(f"Found {len(subreddit_list)} relevant subreddits in directory")
                logger.info(f"Found {len(subreddit_list)} relevant subreddits in directory")
                return subreddit_list
                
        except Exception as e:
            console.print(f"[bold red]Error in subreddit directory search: {str(e)}[/bold red]")
            logger.error(f"Error in subreddit directory search: {str(e)}")
            return []

async def find_subreddits(query: str) -> list:
    """Main function to find subreddits with fallbacks"""
    console.print(f"Finding subreddits for query: {query}")
    logger.info(f"Finding subreddits for query: {query}")
    
    # Try Reddit search JSON API first
    reddit_results = await search_reddit_json(query)
    if reddit_results:
        return reddit_results
    
    # Then try top subreddits
    top_results = await search_top_subreddits(query)
    if top_results:
        return top_results
    
    # Fallback to our hardcoded list
    console.print("[yellow]Using fallback subreddit list[/yellow]")
    logger.warning("Using fallback subreddit list")
    return FALLBACK_SUBREDDITS 