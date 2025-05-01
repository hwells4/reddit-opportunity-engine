import os
from dotenv import load_dotenv
from openai import OpenAI
from rich.console import Console
from rich.pretty import pprint
import json
from duckduckgo_search import DDGS
import time
import argparse
import re
from subreddit_utils import get_subreddit_info, extract_subreddit_metadata, enrich_subreddit_recommendations, clear_cache
import random
import uuid

# Load environment variables
load_dotenv()

# Setup console for better output
console = Console()

# Initialize OpenAI client with OpenRouter base URL
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

# Track API calls
api_call_count = 0
run_id = str(uuid.uuid4())[:8]  # Generate a unique ID for this run

def search_web(query, max_results=5, max_retries=2):
    """Search the web using DuckDuckGo."""
    console.print(f"[yellow]🔎 Searching web for:[/yellow] {query}")
    retry_count = 0
    base_delay = 2
    
    while retry_count <= max_retries:
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
            
            if not results:
                console.print("[yellow]No results found[/yellow]")
                return []
                
            console.print(f"[green]Found {len(results)} results[/green]")
            
            # Add more detailed output about the search results
            console.print("[cyan]Search result details:[/cyan]")
            for i, result in enumerate(results):
                title = result.get('title', 'No title')
                # Truncate long titles for display clarity
                if len(title) > 70:
                    title = title[:67] + "..."
                    
                # Check if this result likely mentions a subreddit
                body = result.get('body', '')
                subreddit_mentions = []
                # Simple regex to find r/subreddit mentions
                subreddit_pattern = r'r/[a-zA-Z0-9_]{3,21}'  # Reddit's subreddit name rules
                matches = re.findall(subreddit_pattern, body)
                if matches:
                    subreddit_mentions = matches[:3]  # Limit to first 3 mentions
                    
                console.print(f"  [bold]{i+1}.[/bold] {title}")
                if subreddit_mentions:
                    console.print(f"     [green]Potential subreddits mentioned:[/green] {', '.join(subreddit_mentions)}")
                
            return results
            
        except Exception as e:
            # Check if it's a rate limit error
            if "Ratelimit" in str(e) and retry_count < max_retries:
                delay = base_delay * (2 ** retry_count) + random.uniform(0, 1)
                console.print(f"[yellow]Search rate limited. Retrying in {delay:.2f} seconds...[/yellow]")
                time.sleep(delay)
                retry_count += 1
                continue
            else:
                console.print(f"[bold red]Error searching web:[/bold red] {str(e)}")
                return []
    
    # If we exhausted retries
    console.print(f"[bold red]Failed to search after {max_retries} retries[/bold red]")
    return []

def extract_subreddits_from_search_results(search_results):
    """Extract potential subreddit mentions from search results."""
    subreddit_mentions = {}
    subreddit_pattern = r'r/[a-zA-Z0-9_]{3,21}'  # Reddit's subreddit name rules
    
    for result in search_results:
        title = result.get('title', '')
        body = result.get('body', '')
        content = title + " " + body
        
        # Find all subreddit mentions
        matches = re.findall(subreddit_pattern, content.lower())
        
        # Count occurrences to prioritize frequently mentioned subreddits
        for match in matches:
            if match in subreddit_mentions:
                subreddit_mentions[match] += 1
            else:
                subreddit_mentions[match] = 1
    
    # Sort by frequency and convert to list
    sorted_mentions = sorted(subreddit_mentions.items(), key=lambda x: x[1], reverse=True)
    
    # Return the top 15 most mentioned subreddits to reduce API calls
    top_subreddits = [name for name, count in sorted_mentions[:15]]
    
    # Always include these important subreddits for this specific topic if found
    target_specific = ['r/realestateinvesting', 'r/landlord', 'r/propertymanagement']
    for specific in target_specific:
        if specific.lower() in [s.lower() for s in top_subreddits]:
            continue
        # Look for it in the original results
        if specific.lower() in [name.lower() for name, _ in sorted_mentions]:
            top_subreddits.append(specific)
    
    console.print(f"[cyan]Prioritizing {len(top_subreddits)} most relevant subreddits to check[/cyan]")
    return top_subreddits

def get_validated_subreddit_data(subreddit_mentions):
    """Validate subreddits and get their metadata."""
    validated_data = []
    
    console.print(f"\n[bold cyan]Validating {len(subreddit_mentions)} potential subreddits...[/bold cyan]")
    
    for subreddit in subreddit_mentions:
        # Clean the subreddit name (remove r/ prefix)
        clean_name = subreddit[2:] if subreddit.startswith('r/') else subreddit
        
        # Get subreddit info
        console.print(f"[yellow]Checking[/yellow] {subreddit}...")
        info = get_subreddit_info(clean_name)
        
        if info:
            # Successfully validated
            metadata = {
                "subreddit_name": f"r/{info.get('display_name', clean_name)}",
                "title": info.get('title', ''),
                "subscribers": info.get('subscribers', 0),
                "public_description": info.get('public_description', ''),
                "created_utc": info.get('created_utc', 0),
                "over18": info.get('over18', False),
                "active_user_count": info.get('active_user_count', 0),
                "url": info.get('url', ''),
                "verified": True
            }
            
            validated_data.append(metadata)
            console.print(f"[green]✓ Validated[/green] {subreddit} - {metadata['subscribers']} subscribers")
        else:
            console.print(f"[red]✗ Could not validate[/red] {subreddit}")
            
        # Brief delay to avoid rate limiting
        time.sleep(0.5)
    
    return validated_data

def make_openrouter_api_call(prompt, reason="unspecified", model="google/gemini-2.5-flash-preview"):
    """
    Centralized function to make API calls to OpenRouter.
    Adds logging and tracking for all calls.
    """
    global api_call_count
    api_call_count += 1
    
    call_id = f"call_{api_call_count}"
    console.print(f"\n[bold red]🔄 MAKING API CALL TO OPENROUTER (Run: {run_id}, Call: {call_id})[/bold red]")
    console.print(f"[bold yellow]Reason for API call: {reason}[/bold yellow]")
    console.print(f"[dim]Using model: {model}[/dim]")
    console.print(f"[dim]Prompt first 100 chars: {prompt[:100]}...[/dim]")
    
    start_time = time.time()
    
    try:
        completion = client.chat.completions.create(
            extra_headers={
                "HTTP-Referer": os.getenv("YOUR_SITE_URL", ""),
                "X-Title": os.getenv("YOUR_SITE_NAME", f"Reddit Finder Agent ({run_id})"),
            },
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={"type": "json_object"}
        )
        
        duration = time.time() - start_time
        input_tokens = completion.usage.prompt_tokens
        output_tokens = completion.usage.completion_tokens
        
        console.print(f"[bold green]✅ API CALL COMPLETED (Run: {run_id}, Call: {call_id})[/bold green]")
        console.print(f"[dim]Duration: {duration:.2f}s, Input tokens: {input_tokens}, Output tokens: {output_tokens}[/dim]")
        
        return completion
    except Exception as e:
        console.print(f"[bold red]❌ API CALL FAILED (Run: {run_id}, Call: {call_id}): {str(e)}[/bold red]")
        raise e

def run_subreddit_finder(product_type=None, problem_area=None, target_audience=None, additional_context=None):
    """
    Find relevant subreddits for the given inputs.
    
    Args:
        product_type (str): Type of product (e.g., "SaaS for indie developers")
        problem_area (str): Problem area the product addresses
        target_audience (str): Target audience for the product
        additional_context (str): Any additional context about what you're looking for
    
    Returns:
        dict: Parsed JSON response with subreddit recommendations
    """
    global api_call_count
    api_call_count = 0  # Reset counter for this run
    
    console.print(f"\n[bold cyan]===== STARTING NEW REDDIT FINDER RUN (ID: {run_id}) =====[/bold cyan]")
    
    # Use default values if not provided
    inputs = {
        "product_type": product_type or "SaaS for indie developers",
        "problem_area": problem_area or "Difficulty finding early adopters and getting initial feedback for new side projects. Struggling with marketing and launch strategies.",
        "target_audience": target_audience or "Solo developers, bootstrappers, indie hackers building and launching their own software products.",
        "additional_context": additional_context or "Looking specifically for communities where developers openly discuss their marketing/growth challenges, share launch experiences (successes and failures), and give feedback on each other's projects. Less interested in purely technical coding help forums."
    }
    
    # Generate dynamic search queries based on the inputs
    console.print("\n[bold cyan]Performing web searches to find relevant subreddits...[/bold cyan]")
    
    search_queries = [
        f"reddit communities for {inputs['product_type']}",
        f"subreddits for {inputs['problem_area']}",
        f"best reddit communities for {inputs['target_audience']}",
    ]
    
    # Add more dynamic queries if specific inputs were provided
    if product_type:
        search_queries.append(f"reddit for {product_type} feedback")
    if problem_area:
        search_queries.append(f"reddit communities discussing {problem_area}")
    if target_audience:
        search_queries.append(f"where do {target_audience} hang out on reddit")
    
    # Add general fallback queries
    search_queries.append("best subreddits for product feedback")
    search_queries.append("reddit communities for startup founders")
    
    # Deduplicate queries
    search_queries = list(set(search_queries))
    
    all_search_results = []
    for query in search_queries:
        results = search_web(query)
        all_search_results.extend(results)
        time.sleep(1)  # Avoid rate limiting
    
    # Extract subreddits from search results
    potential_subreddits = extract_subreddits_from_search_results(all_search_results)
    console.print(f"\n[bold cyan]Found {len(potential_subreddits)} potential subreddits in search results[/bold cyan]")
    
    # Get validated metadata for potential subreddits
    validated_subreddits = get_validated_subreddit_data(potential_subreddits)
    console.print(f"\n[bold green]Successfully validated {len(validated_subreddits)} subreddits[/bold green]")
    
    # Prepare context from search results and validated subreddits
    search_context = ""
    if all_search_results:
        search_context = "Based on the following information from web searches:\n\n"
        for i, result in enumerate(all_search_results[:10]):  # Limit to 10 results to avoid token limits
            search_context += f"Result {i+1}:\n"
            search_context += f"Title: {result.get('title', 'No title')}\n"
            search_context += f"Content: {result.get('body', 'No content')}\n\n"
    
    # Add validated subreddit data to context
    subreddit_context = ""
    if validated_subreddits:
        subreddit_context = "\n\nValidated subreddit information:\n\n"
        for i, sub in enumerate(validated_subreddits):
            subreddit_context += f"Subreddit {i+1}: {sub['subreddit_name']}\n"
            subreddit_context += f"Title: {sub['title']}\n"
            subreddit_context += f"Subscribers: {sub['subscribers']}\n"
            subreddit_context += f"Description: {sub['public_description']}\n"
            subreddit_context += f"NSFW: {sub['over18']}\n"
            subreddit_context += f"Active users: {sub['active_user_count']}\n\n"
    
    # Prepare prompt with search results and validated subreddits
    prompt = f"""
You are an expert Reddit Community Discovery Specialist. Your goal is to help entrepreneurs find the most relevant subreddits for researching product opportunities based on their stated interests and needs.

Carefully analyze the user's focus area:
- Product Type: {inputs['product_type']}
- Problem Area: {inputs['problem_area']}
- Target Audience: {inputs['target_audience']}
- Additional Context: {inputs['additional_context']}

{search_context}
{subreddit_context}

Based on both the search results and the validated subreddit data, please provide:
1. 3-5 relevant subreddits with the following details for each:
   - Subreddit name (starting with r/)
   - Approximate subscriber count (use the actual values provided in the validated data if available)
   - Why this subreddit is relevant (2-3 sentences)
   - Typical content types found in this subreddit
   - How the audience aligns with the target audience

When choosing which subreddits to recommend:
- Prioritize subreddits that have been validated and have accurate metadata
- Consider subscriber count as one factor - larger communities may have more activity, but smaller niche communities may be more targeted
- Look for relevance to the specific problem area and target audience
- Avoid very broad or general subreddits unless they're exceptionally relevant
- Avoid NSFW subreddits unless specifically requested

2. 3-5 specific search term suggestions to use within these subreddits

Your response should be a valid JSON object with this structure:
{{
  "subreddit_recommendations": [
    {{
      "subreddit_name": "r/example",
      "subscriber_count": "100k",
      "relevance_explanation": "This subreddit is relevant because...",
      "content_type": "Discussions, project showcases, etc.",
      "audience_alignment": "The audience consists of..."
    }}
  ],
  "search_suggestions": ["term1", "term2", "term3"]
}}
"""

    try:
        # Make the API call using our centralized function
        completion = make_openrouter_api_call(
            prompt=prompt,
            reason="Generate subreddit recommendations based on search results and validated subreddits",
            model="google/gemini-2.5-flash-preview"
        )
        
        # Extract and parse response
        response_content = completion.choices[0].message.content
        console.print("\n[bold green]✅ Successfully received response:[/bold green]")
        
        # Parse JSON response
        try:
            parsed_response = json.loads(response_content)
            
            # Summary of AI's recommendations
            if "subreddit_recommendations" in parsed_response:
                console.print("\n[bold cyan]AI recommended these subreddits:[/bold cyan]")
                for i, rec in enumerate(parsed_response["subreddit_recommendations"]):
                    console.print(f"  [bold]{i+1}.[/bold] {rec['subreddit_name']} ({rec.get('subscriber_count', 'Unknown')} subscribers)")
                    console.print(f"     Relevance: {rec['relevance_explanation'][:100]}...")
            
            # Optional: Double-check the recommendations to ensure they're all validated
            if "subreddit_recommendations" in parsed_response:
                console.print("\n[bold cyan]Verifying final recommendations...[/bold cyan]")
                parsed_response["subreddit_recommendations"] = enrich_subreddit_recommendations(
                    parsed_response["subreddit_recommendations"]
                )
                
                # Show verification results
                console.print("\n[bold green]Verified recommendations:[/bold green]")
                for i, rec in enumerate(parsed_response["subreddit_recommendations"]):
                    verified = rec.get('metadata', {}).get('verified', False)
                    status = "[green]✓[/green]" if verified else "[red]✗[/red]"
                    console.print(f"  {status} [bold]{i+1}.[/bold] {rec['subreddit_name']} ({rec.get('subscriber_count', 'Unknown')} subscribers)")
                    
                    if 'metadata' in rec and verified:
                        metadata_title = rec['metadata'].get('title', '')
                        metadata_description = rec['metadata'].get('public_description', '')
                        # Truncate description if it's too long
                        if len(metadata_description) > 100:
                            metadata_description = metadata_description[:97] + "..."
                            
                        console.print(f"     Title: {metadata_title}")
                        console.print(f"     Description: {metadata_description}")
            
            pprint(parsed_response)
            # Clear the cache before returning
            clear_cache()
            console.print(f"\n[bold cyan]===== COMPLETED REDDIT FINDER RUN (ID: {run_id}, Total API Calls: {api_call_count}) =====[/bold cyan]")
            return parsed_response
        except json.JSONDecodeError:
            console.print("[bold red]Error: Response was not valid JSON[/bold red]")
            console.print(response_content)
            # Clear the cache on error too
            clear_cache()
            return None
            
    except Exception as e:
        console.print(f"[bold red]Error making request to OpenRouter:[/bold red] {str(e)}")
        # Clear the cache on error
        clear_cache()
        return None

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='Find relevant subreddits based on product, problem area, and target audience.')
    parser.add_argument('--product-type', type=str, help='Type of product (e.g., "SaaS for indie developers")')
    parser.add_argument('--problem-area', type=str, help='Problem area the product addresses')
    parser.add_argument('--target-audience', type=str, help='Target audience for the product')
    parser.add_argument('--additional-context', type=str, help='Any additional context about what you\'re looking for')
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_arguments()
    run_subreddit_finder(
        product_type=args.product_type,
        problem_area=args.problem_area,
        target_audience=args.target_audience,
        additional_context=args.additional_context
    ) 