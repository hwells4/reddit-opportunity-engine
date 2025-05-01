import requests
import time
import random
from typing import Dict, Any, Optional, List
from rich.console import Console

# Setup console for better output
console = Console()

# Simple in-memory cache for subreddit data to reduce API calls
SUBREDDIT_CACHE = {}

def get_subreddit_info(subreddit: str, max_retries: int = 3) -> Optional[Dict[str, Any]]:
    """
    Fetch metadata for a subreddit using Reddit's public JSON endpoint.
    Implements exponential backoff for rate limits.
    
    Args:
        subreddit: Name of the subreddit without the r/ prefix
        max_retries: Maximum number of retry attempts for rate limits
        
    Returns:
        Dictionary containing subreddit metadata or None if the subreddit doesn't exist
        or an error occurred
    """
    # Clean the subreddit name (remove r/ prefix if present)
    clean_subreddit = subreddit.strip().lower()
    if clean_subreddit.startswith('r/'):
        clean_subreddit = clean_subreddit[2:]
    
    # Check cache first
    if clean_subreddit in SUBREDDIT_CACHE:
        console.print(f"[cyan]Using cached data for r/{clean_subreddit}[/cyan]")
        return SUBREDDIT_CACHE[clean_subreddit]
        
    url = f"https://www.reddit.com/r/{clean_subreddit}/about.json"
    
    # Use a browser-like user agent to avoid potential blocks
    headers = {
        'User-Agent': f'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{random.randint(90, 115)}.0.{random.randint(1000, 9999)}.{random.randint(100, 999)} Safari/537.36'
    }
    
    retry_count = 0
    base_delay = 2  # Start with 2 seconds
    
    while retry_count <= max_retries:
        try:
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('kind') == 't5':  # 't5' indicates a subreddit
                    # Store in cache
                    SUBREDDIT_CACHE[clean_subreddit] = data.get('data')
                    return data.get('data')
                else:
                    console.print(f"[yellow]Response doesn't contain expected subreddit data for r/{clean_subreddit}[/yellow]")
                    return None
            elif response.status_code == 404:
                console.print(f"[yellow]Subreddit r/{clean_subreddit} doesn't exist[/yellow]")
                # Cache negative result to avoid repeated lookups
                SUBREDDIT_CACHE[clean_subreddit] = None
                return None
            elif response.status_code == 403:
                console.print(f"[yellow]Subreddit r/{clean_subreddit} is private or quarantined[/yellow]")
                # Cache negative result
                SUBREDDIT_CACHE[clean_subreddit] = None
                return None
            elif response.status_code == 429:
                # Rate limited - implement exponential backoff
                if retry_count < max_retries:
                    delay = base_delay * (2 ** retry_count) + random.uniform(0, 1)
                    console.print(f"[yellow]Rate limited. Retrying in {delay:.2f} seconds...[/yellow]")
                    time.sleep(delay)
                    retry_count += 1
                    continue
                else:
                    console.print(f"[bold red]Rate limit exceeded for r/{clean_subreddit} after {max_retries} retries[/bold red]")
                    return None
            else:
                console.print(f"[bold red]Error fetching r/{clean_subreddit}: HTTP {response.status_code}[/bold red]")
                return None
                
        except Exception as e:
            console.print(f"[bold red]Exception fetching r/{clean_subreddit}: {str(e)}[/bold red]")
            return None
        
        # Break the loop if we reach here (non-retry case)
        break
    
    # If we exhausted retries
    return None

def extract_subreddit_metadata(subreddit_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract the most relevant metadata fields from the full subreddit data.
    
    Args:
        subreddit_data: Full subreddit data from the Reddit API
        
    Returns:
        Dictionary with selected metadata fields
    """
    return {
        "subreddit_name": f"r/{subreddit_data.get('display_name', '')}",
        "title": subreddit_data.get('title', ''),
        "subscribers": subreddit_data.get('subscribers', 0),
        "public_description": subreddit_data.get('public_description', ''),
        "description": subreddit_data.get('description', ''),
        "created_utc": subreddit_data.get('created_utc', 0),
        "over18": subreddit_data.get('over18', False),
        "subreddit_type": subreddit_data.get('subreddit_type', ''),
        "active_user_count": subreddit_data.get('active_user_count', 0),
        "url": subreddit_data.get('url', ''),
    }

def enrich_subreddit_recommendations(recommendations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Enrich a list of subreddit recommendations with actual metadata from Reddit.
    Includes rate limit handling.
    
    Args:
        recommendations: List of subreddit recommendation dictionaries
            Each should have at least a 'subreddit_name' key
            
    Returns:
        The same list with enriched metadata where available
    """
    enriched_recommendations = []
    
    for recommendation in recommendations:
        subreddit_name = recommendation.get('subreddit_name', '')
        
        # Skip if no subreddit name
        if not subreddit_name:
            enriched_recommendations.append(recommendation)
            continue
            
        # Clean the subreddit name
        clean_subreddit = subreddit_name.strip().lower()
        if clean_subreddit.startswith('r/'):
            clean_subreddit = clean_subreddit[2:]
        
        # Get actual subreddit info
        info = get_subreddit_info(clean_subreddit)
        
        if info:
            # The subreddit exists, update with real data
            recommendation['subscriber_count'] = str(info.get('subscribers', 0))
            
            # Add additional metadata that might be useful for the frontend
            recommendation['metadata'] = {
                'title': info.get('title', ''),
                'public_description': info.get('public_description', ''),
                'created_utc': info.get('created_utc', 0),
                'over18': info.get('over18', False),
                'active_user_count': info.get('active_user_count', 0),
                'url': info.get('url', ''),
                'verified': True
            }
        else:
            # The subreddit doesn't exist or couldn't be fetched
            # Keep original data but mark as unverified
            recommendation['metadata'] = {
                'verified': False,
                'error': 'Could not verify subreddit'
            }
        
        # Add to enriched list
        enriched_recommendations.append(recommendation)
        
        # Add randomized delay to avoid rate limiting
        delay = random.uniform(1.0, 3.0)
        time.sleep(delay)
    
    return enriched_recommendations

def clear_cache():
    """Clear the subreddit cache."""
    global SUBREDDIT_CACHE
    SUBREDDIT_CACHE = {}
    console.print("[green]Subreddit cache cleared[/green]")

# Example usage
if __name__ == "__main__":
    # Test with a known subreddit
    subreddit_info = get_subreddit_info("python")
    if subreddit_info:
        metadata = extract_subreddit_metadata(subreddit_info)
        console.print("[bold green]Subreddit metadata:[/bold green]")
        for key, value in metadata.items():
            console.print(f"[cyan]{key}:[/cyan] {value}") 