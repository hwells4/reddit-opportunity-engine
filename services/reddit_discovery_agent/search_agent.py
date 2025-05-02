import os
import time
import random
import uuid
import json
from rich.console import Console
from dotenv import load_dotenv
from openai import OpenAI
from duckduckgo_search import DDGS
import re
from subreddit_utils import get_subreddit_info, clear_cache

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

class SearchAgent:
    def __init__(self, product_type, problem_area, target_audience, additional_context=None):
        self.product_type = product_type
        self.problem_area = problem_area
        self.target_audience = target_audience
        self.additional_context = additional_context
        
        self.search_iterations = 0
        self.max_iterations = 3
        self.all_search_results = []
        self.found_subreddits = set()
        self.validated_subreddits = []
        self.niche_threshold = 500000  # Subreddits with fewer subscribers than this are considered niche
        self.min_subscriber_threshold = 2500  # Minimum number of subscribers for a subreddit to be useful
        
    def search_web(self, query, max_results=5, max_retries=2):
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
                    matches = re.findall(subreddit_pattern, body.lower() + " " + title.lower())
                    if matches:
                        subreddit_mentions = list(set(matches))[:3]  # Limit to first 3 unique mentions
                        
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
        
    def extract_subreddits_from_results(self, search_results):
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
        
        # Extract just the subreddit names
        extracted_subreddits = [name for name, count in sorted_mentions]
        
        # Add newly found subreddits to our set
        for subreddit in extracted_subreddits:
            self.found_subreddits.add(subreddit)
            
        return extracted_subreddits
        
    def validate_subreddit(self, subreddit_name):
        """Validate a subreddit and get its metadata."""
        # Clean the subreddit name (remove r/ prefix)
        clean_name = subreddit_name[2:] if subreddit_name.startswith('r/') else subreddit_name
        
        # Get subreddit info
        console.print(f"[yellow]Checking[/yellow] {subreddit_name}...")
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
            
            subscriber_count = metadata['subscribers']
            
            # Check if the subreddit meets the minimum subscriber threshold
            if subscriber_count < self.min_subscriber_threshold:
                console.print(f"[yellow]✓ Validated but too small[/yellow] {subreddit_name} - {subscriber_count} subscribers (minimum {self.min_subscriber_threshold})")
                return None
                
            console.print(f"[green]✓ Validated[/green] {subreddit_name} - {subscriber_count} subscribers")
            return metadata
        else:
            console.print(f"[red]✗ Could not validate[/red] {subreddit_name}")
            return None
            
    def validate_subreddits(self, subreddit_list):
        """Validate a list of subreddits and get their metadata."""
        validated = []
        
        for subreddit in subreddit_list:
            metadata = self.validate_subreddit(subreddit)
            if metadata:
                validated.append(metadata)
                
            # Brief delay to avoid rate limiting
            time.sleep(0.5)
            
        return validated
        
    def make_ai_call(self, prompt, reason="unspecified", model="google/gemini-2.5-flash-preview"):
        """Make an API call to OpenRouter."""
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
            
            return completion.choices[0].message.content
            
        except Exception as e:
            console.print(f"[bold red]❌ API CALL FAILED (Run: {run_id}, Call: {call_id}): {str(e)}[/bold red]")
            raise e
            
    def generate_search_queries(self, iteration=0, previous_results=None):
        """Generate search queries using AI based on the current state."""
        context = f"""
Product Type: {self.product_type}
Problem Area: {self.problem_area}
Target Audience: {self.target_audience}
Additional Context: {self.additional_context or "None provided"}

Current iteration: {iteration + 1} of {self.max_iterations}
"""

        # Add previously found subreddits for context if this isn't the first iteration
        if iteration > 0 and previous_results:
            context += "\nPreviously found subreddits:\n"
            for sub in previous_results:
                subscribers = sub.get('subscribers', 'Unknown')
                context += f"- {sub['subreddit_name']} ({subscribers} subscribers): {sub.get('title', 'No title')}\n"
                
            context += "\nWe need a mix of niche communities (ideally under 500,000 subscribers) and highly relevant larger communities."

        prompt = f"""
You are an expert at discovering relevant Reddit communities. Your goal is to generate effective search queries that will help find:

1. Niche subreddits (ideally 2,500-500,000 subscribers) that are highly relevant to the target audience and problem area
2. Larger, but still highly relevant, subreddits that might provide valuable insights 

For context:
{context}

Please generate 4-6 specific, targeted search queries with a mix of:

1. Specific terminology or jargon used by the target audience
2. Combinations of multiple relevant concepts (e.g., "reddit indie game developers marketing discord")
3. Long-tail searches that might yield specific results
4. Queries targeting both niche communities and larger communities with high relevance 

Your response should be a valid JSON object with this structure:
{{
  "search_queries": [
    "specific query 1",
    "specific query 2",
    "specific query 3",
    "specific query 4"
  ],
  "reasoning": "Brief explanation of your strategy for these queries"
}}
"""

        # Make the API call
        response = self.make_ai_call(
            prompt=prompt,
            reason=f"Generate search queries for iteration {iteration + 1}",
            model="google/gemini-2.5-flash-preview"
        )
        
        try:
            parsed_response = json.loads(response)
            return parsed_response.get("search_queries", [])
        except json.JSONDecodeError:
            console.print("[bold red]Error: AI response was not valid JSON[/bold red]")
            console.print(response)
            # Fallback to some default queries
            return [
                f"small niche subreddits for {self.target_audience}",
                f"reddit communities under 100k for {self.product_type}",
                f"specialized reddit forums {self.problem_area}",
                f"best subreddits for {self.product_type} {self.problem_area}"
            ]
            
    def think(self, validated_subreddits):
        """Evaluate search progress and determine next steps using AI."""
        # Count how many niche vs large subreddits we've found
        niche_count = sum(1 for sub in validated_subreddits if self.min_subscriber_threshold <= sub.get('subscribers', 0) < self.niche_threshold)
        large_count = sum(1 for sub in validated_subreddits if sub.get('subscribers', 0) >= self.niche_threshold)
        
        # Prepare context for the AI
        context = f"""
Product Type: {self.product_type}
Problem Area: {self.problem_area}
Target Audience: {self.target_audience}
Additional Context: {self.additional_context or "None provided"}

Search progress:
- Total iterations completed: {self.search_iterations}
- Total validated subreddits found: {len(validated_subreddits)}
- Niche subreddits (2,500-{self.niche_threshold:,} subscribers): {niche_count}
- Large subreddits (over {self.niche_threshold:,} subscribers): {large_count}
"""

        subreddit_info = ""
        for sub in validated_subreddits:
            subreddit_info += f"- {sub['subreddit_name']} ({sub.get('subscribers', 'Unknown')} subscribers): {sub.get('title', 'No title')}\n"
        
        prompt = f"""
You are a Reddit community discovery expert with a focus on finding relevant subreddits for product research and validation.

Current search state:
{context}

Subreddit details:
{subreddit_info}

Your task is to evaluate our current search progress and recommend next steps.

Please analyze:
1. Quality of subreddits found so far (relevance, size, focus)
2. Whether we have enough communities for good data analysis (aiming for 6-8 total subreddits)
3. Balance between niche communities (2,500-500K subscribers) and larger highly relevant communities 
4. If another search iteration would likely yield better results
5. What search strategy to use next if we continue

Your response should be a valid JSON object with this structure:
{{
  "evaluation": "Detailed analysis of search results quality",
  "found_sufficient_communities": true/false,
  "continue_searching": true/false,
  "recommended_strategy": "Strategy for next iteration if continuing",
  "top_recommendations": [
    {{
      "subreddit_name": "Name of top recommended subreddit",
      "reason": "Why this is a good match"
    }}
  ]
}}
"""

        # Make the API call
        response = self.make_ai_call(
            prompt=prompt,
            reason="Evaluate search progress and determine next steps",
            model="google/gemini-2.5-flash-preview"
        )
        
        try:
            parsed_response = json.loads(response)
            return parsed_response
        except json.JSONDecodeError:
            console.print("[bold red]Error: AI response was not valid JSON[/bold red]")
            console.print(response)
            # Default response
            return {
                "evaluation": "Unable to properly evaluate results",
                "found_sufficient_communities": len(validated_subreddits) >= 6,
                "continue_searching": len(validated_subreddits) < 6 and self.search_iterations < self.max_iterations,
                "recommended_strategy": "Try more specific search terms"
            }
    
    def run(self):
        """Run the search agent with an agentic loop."""
        console.print(f"\n[bold cyan]===== STARTING SEARCH AGENT RUN (ID: {run_id}) =====[/bold cyan]")
        
        sufficient_results = False
        
        while not sufficient_results and self.search_iterations < self.max_iterations:
            console.print(f"\n[bold cyan]===== ITERATION {self.search_iterations + 1} =====[/bold cyan]")
            
            # Generate search queries using AI if not the first iteration
            if self.search_iterations == 0:
                # First iteration: use basic queries to establish a baseline
                search_queries = [
                    f"reddit communities for {self.product_type}",
                    f"subreddits for {self.problem_area}",
                    f"best reddit communities for {self.target_audience}",
                    f"niche subreddits for {self.target_audience}",
                    f"small specialized subreddits {self.product_type}",
                    f"top subreddits {self.product_type} {self.target_audience}"
                ]
            else:
                # Use AI to generate more targeted queries based on previous results
                search_queries = self.generate_search_queries(
                    iteration=self.search_iterations, 
                    previous_results=self.validated_subreddits
                )
            
            console.print(f"\n[bold cyan]Generated {len(search_queries)} search queries for this iteration[/bold cyan]")
            for i, query in enumerate(search_queries):
                console.print(f"  [bold]{i+1}.[/bold] {query}")
            
            # Perform searches
            iteration_results = []
            for query in search_queries:
                results = self.search_web(query)
                iteration_results.extend(results)
                self.all_search_results.extend(results)
                time.sleep(1)  # Avoid rate limiting
            
            # Extract and validate subreddits from this iteration's results
            potential_subreddits = self.extract_subreddits_from_results(iteration_results)
            console.print(f"\n[bold cyan]Found {len(potential_subreddits)} potential subreddits in this iteration[/bold cyan]")
            
            # Only validate new subreddits we haven't validated before
            already_validated = {sub['subreddit_name'].lower() for sub in self.validated_subreddits}
            new_to_validate = [sub for sub in potential_subreddits if sub.lower() not in already_validated]
            
            console.print(f"\n[bold cyan]Validating {len(new_to_validate)} new subreddits...[/bold cyan]")
            new_validated = self.validate_subreddits(new_to_validate)
            self.validated_subreddits.extend(new_validated)
            
            console.print(f"\n[bold green]Found {len(new_validated)} new valid subreddits in iteration {self.search_iterations + 1}[/bold green]")
            
            # Use the "Think" function to evaluate progress and decide next steps
            if len(self.validated_subreddits) > 0:
                evaluation = self.think(self.validated_subreddits)
                
                console.print(f"\n[bold cyan]Evaluation of search progress:[/bold cyan]")
                console.print(evaluation.get("evaluation", "No evaluation provided"))
                
                sufficient_results = evaluation.get("found_sufficient_communities", False)
                should_continue = evaluation.get("continue_searching", True)
                
                if sufficient_results:
                    console.print("\n[bold green]✅ Found sufficient communities! Ending search.[/bold green]")
                    break
                    
                if not should_continue:
                    console.print("\n[bold yellow]🛑 AI suggests stopping the search. We have the best results we're likely to find.[/bold yellow]")
                    break
                    
                console.print(f"\n[bold cyan]Strategy for next iteration:[/bold cyan] {evaluation.get('recommended_strategy', 'No strategy provided')}")
            
            # Increment iteration counter
            self.search_iterations += 1
        
        # Search complete - return validated subreddits
        console.print(f"\n[bold green]===== SEARCH COMPLETE ({self.search_iterations} iterations) =====[/bold green]")
        console.print(f"[bold green]Found {len(self.validated_subreddits)} validated subreddits[/bold green]")
        
        # Display count of API calls made
        console.print(f"[bold cyan]Total API calls made: {api_call_count}[/bold cyan]")
        
        # Clear cache
        clear_cache()
        
        return self.validated_subreddits

# Simple example of how to use this agent
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Find niche subreddits through iterative search.')
    parser.add_argument('--product-type', type=str, required=True, help='Type of product')
    parser.add_argument('--problem-area', type=str, required=True, help='Problem area the product addresses')
    parser.add_argument('--target-audience', type=str, required=True, help='Target audience for the product')
    parser.add_argument('--additional-context', type=str, help='Any additional context')
    
    args = parser.parse_args()
    
    agent = SearchAgent(
        product_type=args.product_type,
        problem_area=args.problem_area,
        target_audience=args.target_audience,
        additional_context=args.additional_context
    )
    
    validated_subreddits = agent.run() 