import os
from dotenv import load_dotenv
from openai import OpenAI
from rich.console import Console
from rich.pretty import pprint
import json
from duckduckgo_search import DDGS
import time
import argparse

# Load environment variables
load_dotenv()

# Setup console for better output
console = Console()

# Initialize OpenAI client with OpenRouter base URL
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

def search_web(query, max_results=5):
    """Search the web using DuckDuckGo."""
    console.print(f"[yellow]🔎 Searching web for:[/yellow] {query}")
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        
        if not results:
            console.print("[yellow]No results found[/yellow]")
            return []
            
        console.print(f"[green]Found {len(results)} results[/green]")
        return results
    except Exception as e:
        console.print(f"[bold red]Error searching web:[/bold red] {str(e)}")
        return []

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
    
    # Prepare context from search results
    search_context = ""
    if all_search_results:
        search_context = "Based on the following information from web searches:\n\n"
        for i, result in enumerate(all_search_results[:15]):  # Limit to 15 results to avoid token limits
            search_context += f"Result {i+1}:\n"
            search_context += f"Title: {result.get('title', 'No title')}\n"
            search_context += f"Content: {result.get('body', 'No content')}\n\n"
    
    # Prepare prompt with search results
    prompt = f"""
You are an expert Reddit Community Discovery Specialist. Your goal is to help entrepreneurs find the most relevant subreddits for researching product opportunities based on their stated interests and needs.

Carefully analyze the user's focus area:
- Product Type: {inputs['product_type']}
- Problem Area: {inputs['problem_area']}
- Target Audience: {inputs['target_audience']}
- Additional Context: {inputs['additional_context']}

{search_context}

Please provide:
1. 3-5 relevant subreddits with the following details for each:
   - Subreddit name (starting with r/)
   - Approximate subscriber count (if known, otherwise "Unknown")
   - Why this subreddit is relevant (2-3 sentences)
   - Typical content types found in this subreddit
   - How the audience aligns with the target audience

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

    console.print("[bold cyan]Making request to OpenRouter with Gemini 2.5 Flash Preview...[/bold cyan]")
    
    # Make the API call
    try:
        completion = client.chat.completions.create(
            extra_headers={
                "HTTP-Referer": os.getenv("YOUR_SITE_URL", ""),
                "X-Title": os.getenv("YOUR_SITE_NAME", "Reddit Finder Agent"),
            },
            model="google/gemini-2.5-flash-preview",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={"type": "json_object"}
        )
        
        # Extract and parse response
        response_content = completion.choices[0].message.content
        console.print("\n[bold green]✅ Successfully received response:[/bold green]")
        
        # Parse JSON response
        try:
            parsed_response = json.loads(response_content)
            pprint(parsed_response)
            return parsed_response
        except json.JSONDecodeError:
            console.print("[bold red]Error: Response was not valid JSON[/bold red]")
            console.print(response_content)
            return None
            
    except Exception as e:
        console.print(f"[bold red]Error making request to OpenRouter:[/bold red] {str(e)}")
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