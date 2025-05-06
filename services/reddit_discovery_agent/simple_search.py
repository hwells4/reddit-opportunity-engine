import asyncio
import aiohttp
import re
import random
import json
from typing import List, Dict, Any

# Simple user agent rotation
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:94.0) Gecko/20100101 Firefox/94.0'
]

# Hardcoded list of subreddits related to business/startups
FALLBACK_SUBREDDITS = [
    "r/startups", "r/Entrepreneur", "r/SaaS", "r/marketing", "r/smallbusiness", 
    "r/webdev", "r/productmanagement", "r/business", "r/copywriting",
    "r/sideproject", "r/programming", "r/growmybusiness", "r/dataisbeautiful"
]

async def search_reddit_json(query: str) -> List[str]:
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
    
    print(f"Searching Reddit JSON API for: {query}")
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, params=params, headers=headers, timeout=15) as response:
                if response.status != 200:
                    print(f"Error: Reddit search returned status {response.status}")
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
                print(f"Found {len(subreddit_list)} subreddits via Reddit JSON API")
                return subreddit_list
                
        except Exception as e:
            print(f"Error in Reddit search: {str(e)}")
            return []

async def search_top_subreddits(query: str) -> List[str]:
    """Get top subreddits from Reddit's directory"""
    url = "https://www.reddit.com/subreddits.json"
    
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "application/json"
    }
    
    print(f"Getting popular subreddits related to: {query}")
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, headers=headers, timeout=15) as response:
                if response.status != 200:
                    print(f"Error: Subreddit directory returned status {response.status}")
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
                print(f"Found {len(subreddit_list)} relevant subreddits in directory")
                return subreddit_list
                
        except Exception as e:
            print(f"Error in subreddit directory search: {str(e)}")
            return []

async def find_subreddits(query: str) -> List[str]:
    """Main function to find subreddits with fallbacks"""
    print(f"Finding subreddits for query: {query}")
    
    # Try Reddit search JSON API first
    reddit_results = await search_reddit_json(query)
    if reddit_results:
        return reddit_results
    
    # Then try top subreddits
    top_results = await search_top_subreddits(query)
    if top_results:
        return top_results
    
    # Fallback to our hardcoded list
    print("Using fallback subreddit list")
    return FALLBACK_SUBREDDITS

if __name__ == "__main__":
    # Test with a sample query
    query = "startup founders product market fit"
    results = asyncio.run(find_subreddits(query))
    
    print("\nResults:")
    for i, subreddit in enumerate(results):
        print(f"{i+1}. {subreddit}") 