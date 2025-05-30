import os
import time
import random
import uuid
import json
import asyncio
import aiohttp
from rich.console import Console
from rich.prompt import Prompt
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from dotenv import load_dotenv
from openai import OpenAI
import re
import requests
from subreddit_utils import get_subreddit_info, clear_cache
from reddit_search import find_subreddits

# Remove import for deleted file
# from simple_search import find_subreddits

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

# Reddit search functions have been moved to reddit_search.py

class SearchAgent:
    def __init__(self, product_type, problem_area, target_audience, additional_context=None, search_mode="validation"):
        self.product_type = product_type
        self.problem_area = problem_area
        self.target_audience = target_audience
        self.additional_context = additional_context
        self.search_mode = search_mode  # New parameter for search mode: 'validation' or 'mvp'
        
        self.search_iterations = 0
        self.max_iterations = 3
        self.min_iterations = 3  # Ensure at least 3 iterations run 
        self.all_search_results = []
        self.found_subreddits = set()
        self.validated_subreddits = []
        self.subreddit_reasons = {}  # Store reasoning for each subreddit
        self.niche_threshold = 750000  # Adjusted: Subreddits with fewer subscribers than this are considered niche
        self.min_subscriber_threshold = 5000  # Adjusted: Minimum number of subscribers for a subreddit to be useful
        self.max_validations_per_iteration = 15  # Increased: Allow more validations per iteration
        
        # Event system for streaming partial results
        self.callbacks = {
            "search_started": [],
            "query_executed": [],
            "search_results": [],
            "subreddit_found": [],
            "subreddit_validated": [],
            "iteration_started": [],
            "iteration_complete": [],
            "thinking_started": [],
            "thinking_complete": [],
            "search_complete": []
        }
        
    def register_callback(self, event_name, callback_fn):
        """Register a callback function for a specific event."""
        if event_name in self.callbacks:
            self.callbacks[event_name].append(callback_fn)
            return True
        return False
        
    def trigger_event(self, event_name, data=None):
        """Trigger an event and call all registered callbacks."""
        if event_name in self.callbacks:
            for callback in self.callbacks[event_name]:
                try:
                    callback(data)
                except Exception as e:
                    console.print(f"[bold red]Error in callback for event '{event_name}': {str(e)}[/bold red]")
        
    async def search_web(self, query, max_results=5, max_retries=3):
        """Search using our direct Reddit JSON API method instead of DuckDuckGo."""
        console.print(f"[yellow]🔎 Searching web for:[/yellow] {query}")
        self.trigger_event("query_executed", {"query": query})
        
        try:
            # Use the imported find_subreddits function 
            subreddits = await find_subreddits(query)
            
            if not subreddits:
                console.print("[yellow]No subreddits found[/yellow]")
                self.trigger_event("search_results", {"query": query, "count": 0, "results": []})
                return []
                
            console.print(f"[green]Found {len(subreddits)} subreddits[/green]")
            
            # Format results to match the expected structure from DuckDuckGo
            results = []
            for subreddit in subreddits:
                results.append({
                    "title": f"Subreddit: {subreddit}",
                    "href": f"https://www.reddit.com/{subreddit}",
                    "body": f"Found in search results for '{query}'",
                })
            
            # Display the found subreddits
            console.print("[cyan]Subreddits found:[/cyan]")
            for i, subreddit in enumerate(subreddits):
                console.print(f"  [bold]{i+1}.[/bold] {subreddit}")
            
            self.trigger_event("search_results", {
                "query": query, 
                "count": len(results), 
                "results": results
            })
            
            return results
            
        except Exception as e:
            console.print(f"[bold red]Error searching web:[/bold red] {str(e)}")
            self.trigger_event("search_results", {"query": query, "error": str(e), "count": 0, "results": []})
            return []
        
    def extract_subreddits_from_results(self, search_results):
        """Extract potential subreddit mentions from search results."""
        subreddit_mentions = {}
        
        for result in search_results:
            title = result.get('title', '')
            
            # Our results already have the subreddit name in the title field
            if title.startswith("Subreddit: r/"):
                subreddit = title.replace("Subreddit: ", "")
                if subreddit in subreddit_mentions:
                    subreddit_mentions[subreddit] += 1
                else:
                    subreddit_mentions[subreddit] = 1
            else:
                # Also look for subreddit mentions in the body
                body = result.get('body', '')
                content = title + " " + body
                
                # Find all subreddit mentions
                matches = re.findall(r'r/[a-zA-Z0-9_]{3,21}', content.lower())
                
                # Count occurrences
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
            self.trigger_event("subreddit_found", {"subreddit": subreddit, "source": "search_results"})
            
        return extracted_subreddits
        
    async def screen_subreddits_for_relevance(self, potential_subreddits):
        """Use AI to screen subreddits for relevance before validation."""
        if not potential_subreddits:
            return []
            
        # Convert list to comma-separated string for prompt
        subreddits_str = ", ".join(potential_subreddits)
        
        # Remove banned subreddits list and filtering logic
        filtered_subreddits = potential_subreddits
        
        # Convert remaining list to comma-separated string for prompt
        subreddits_str = ", ".join(filtered_subreddits)
        
        prompt = f"""
You are a Reddit relevance expert with EXTREMELY HIGH STANDARDS for determining relevance to a specific product market. 
Your task is to evaluate which subreddits from a given list are DIRECTLY relevant to our specific product/market niche. 
Be EXTREMELY STRICT in your evaluations, rejecting anything that isn't a perfect fit.

<product_information>
- Product Type: {self.product_type}
- Problem Area: {self.problem_area}
- Target Audience: {self.target_audience}
- Additional Context: {self.additional_context or "None provided"}
</product_information>

<subreddits_to_evaluate>
{subreddits_str}
</subreddits_to_evaluate>

<evaluation_criteria>
A subreddit is ONLY relevant if it meets AT LEAST TWO of these criteria:
1. The subreddit PRIMARILY consists of our EXACT target users (not just general users who might overlap)
2. The subreddit FREQUENTLY has discussions DIRECTLY related to our specific problem area (market research, validation, product building)
3. The subreddit's users would be IMMEDIATELY interested in our specific product type (AI market research tool)
4. The subreddit EXPLICITLY focuses on topics like: startups, indie hacking, solopreneurs, product validation, marketing research
</evaluation_criteria>

<strict_instructions>
- Use a HIGH bar (85+ on a 100-point scale) - only include subreddits with a DIRECT, OBVIOUS connection
- Be EXTREMELY SUSPICIOUS of large subreddits (>1M subscribers) - they must have a very direct connection to be included
- If a subreddit seems "maybe" relevant or "somewhat" relevant, REJECT IT
- Only include subreddits that are a PERFECT FIT for our market and use case
</strict_instructions>

First, carefully analyze each subreddit in <thinking> tags to determine relevance.

Then respond ONLY with a valid JSON object in the following format:

<json_format>
{{
  "relevant_subreddits": [
    {{
      "name": "r/subredditname",
      "relevance_score": 92,
      "reason": "SPECIFIC evidence of direct relevance with clear examples of how this perfectly fits our market/product"
    }}
  ],
  "irrelevant_subreddits": [
    {{
      "name": "r/subredditname",
      "reason": "Brief explanation of why this isn't directly relevant enough"
    }}
  ]
}}
</json_format>

Only include subreddits with a relevance score of 85 or higher in the relevant_subreddits list.

Your response must begin with the opening curly brace of the JSON object and end with the closing curly brace, with no other text outside these braces.
"""

        console.print(f"[yellow]🔍 Screening {len(filtered_subreddits)} subreddits for relevance...[/yellow]")
        self.trigger_event("screening_subreddits", {
            "count": len(filtered_subreddits),
            "subreddits": filtered_subreddits
        })
        
        # Make the API call
        response = self.make_ai_call(
            prompt=prompt,
            reason=f"Screen subreddits for relevance",
            model="google/gemini-2.5-flash-preview"
        )
        
        try:
            parsed_response = json.loads(response)
            relevant_subreddits = parsed_response.get("relevant_subreddits", [])
            irrelevant_subreddits = parsed_response.get("irrelevant_subreddits", [])
            
            # Extract just the names of relevant subreddits
            relevant_names = [sub["name"] for sub in relevant_subreddits]
            
            # Create a mapping of subreddit names to their reasoning
            self.subreddit_reasons = {sub["name"]: sub["reason"] for sub in relevant_subreddits}
            
            # Log results
            console.print(f"[green]✓ Found {len(relevant_names)} relevant subreddits[/green]")
            for sub in relevant_subreddits:
                console.print(f"  [bold green]✓ {sub['name']}[/bold green] (Score: {sub['relevance_score']}): {sub['reason']}")
                
            if irrelevant_subreddits:
                console.print(f"[red]✗ Filtered out {len(irrelevant_subreddits)} irrelevant subreddits[/red]")
                for sub in irrelevant_subreddits[:5]:  # Show only first 5 to avoid clutter
                    console.print(f"  [dim red]✗ {sub['name']}[/dim red]: {sub['reason']}")
                if len(irrelevant_subreddits) > 5:
                    console.print(f"  [dim red]... and {len(irrelevant_subreddits) - 5} more[/dim red]")
            
            self.trigger_event("subreddits_screened", {
                "relevant_count": len(relevant_names),
                "irrelevant_count": len(irrelevant_subreddits),
                "relevant_subreddits": relevant_subreddits,
                "irrelevant_subreddits": irrelevant_subreddits
            })
            
            return relevant_names
            
        except json.JSONDecodeError:
            console.print("[bold red]Error: AI response was not valid JSON[/bold red]")
            
            # Attempt to extract relevant subreddits using regex
            # Pattern to match relevant subreddits with scores
            pattern = r'"name": "(r/[a-zA-Z0-9_]+)".*?"relevance_score": (\d+)'
            matches = re.findall(pattern, response)
            
            if matches:
                # Filter to only include subreddits with score >= 85
                relevant_subs = [name for name, score in matches if int(score) >= 85]
                
                console.print(f"[yellow]⚠️ Extracted {len(relevant_subs)} relevant subreddits from broken JSON[/yellow]")
                for sub in relevant_subs:
                    console.print(f"  [bold yellow]✓ {sub}[/bold yellow]")
                
                self.trigger_event("subreddits_extracted_from_broken_json", {
                    "count": len(relevant_subs),
                    "subreddits": relevant_subs
                })
                
                return relevant_subs
                
            # If extraction also fails, log the error and fall back to a filtered approach
            console.print("[bold red]Failed to extract relevant subreddits from response[/bold red]")
            console.print("[yellow]⚠️ Using basic filtering heuristics instead[/yellow]")
            
            # More targeted heuristics to filter subreddits
            relevant_subreddits = []
            
            # Whitelist of keywords that indicate high relevance
            highly_relevant_terms = [
                "startup", "founder", "entrepreneur", "product", "business", "indiehack", 
                "market", "research", "validation", "solopreneur", "launch", "saas", 
                "bootstrap", "copywriting", "growth", "sideproject"
            ]
            
            for subreddit in filtered_subreddits:
                # Extract just the name without r/
                name = subreddit[2:] if subreddit.startswith('r/') else subreddit
                name = name.lower()
                
                # Check if any highly relevant term is in the subreddit name
                if any(term in name for term in highly_relevant_terms):
                    relevant_subreddits.append(subreddit)
                    reason = f"Contains keyword: {[term for term in highly_relevant_terms if term in name][0]}"
                    self.subreddit_reasons[subreddit] = reason
            
            console.print(f"[yellow]Keeping {len(relevant_subreddits)} relevant subreddits based on keyword matching[/yellow]")
            
            self.trigger_event("filtering_via_heuristics", {
                "kept_count": len(relevant_subreddits),
                "filtered_count": len(filtered_subreddits) - len(relevant_subreddits),
                "kept": relevant_subreddits
            })
            
            return relevant_subreddits
        
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
                "verified": True,
                # Add the reasoning if available for this subreddit
                "selection_reason": self.subreddit_reasons.get(f"r/{clean_name}", "Relevant subreddit for market research")
            }
            
            subscriber_count = metadata['subscribers']
            
            # Check if the subreddit meets the minimum subscriber threshold
            if subscriber_count < self.min_subscriber_threshold:
                console.print(f"[yellow]✓ Validated but too small[/yellow] {subreddit_name} - {subscriber_count} subscribers (minimum {self.min_subscriber_threshold})")
                self.trigger_event("subreddit_validated", {
                    "subreddit": subreddit_name,
                    "status": "too_small",
                    "subscribers": subscriber_count,
                    "min_threshold": self.min_subscriber_threshold
                })
                return None
                
            console.print(f"[green]✓ Validated[/green] {subreddit_name} - {subscriber_count} subscribers")
            self.trigger_event("subreddit_validated", {
                "subreddit": subreddit_name,
                "status": "valid",
                "metadata": metadata,
                "is_niche": subscriber_count < self.niche_threshold
            })
            return metadata
        else:
            console.print(f"[red]✗ Could not validate[/red] {subreddit_name}")
            self.trigger_event("subreddit_validated", {
                "subreddit": subreddit_name,
                "status": "invalid"
            })
            return None

    async def validate_subreddit_async(self, subreddit_name, session=None):
        """Async version: Validate a subreddit and get its metadata."""
        # Clean the subreddit name (remove r/ prefix)
        clean_name = subreddit_name[2:] if subreddit_name.startswith('r/') else subreddit_name
        
        # Get subreddit info
        console.print(f"[yellow]Checking[/yellow] {subreddit_name}...")
        
        from subreddit_utils import get_subreddit_info_async
        info = await get_subreddit_info_async(clean_name, session=session)
        
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
                "verified": True,
                # Add the reasoning if available for this subreddit
                "selection_reason": self.subreddit_reasons.get(f"r/{clean_name}", "Relevant subreddit for market research")
            }
            
            subscriber_count = metadata['subscribers']
            
            # Check if the subreddit meets the minimum subscriber threshold
            if subscriber_count < self.min_subscriber_threshold:
                console.print(f"[yellow]✓ Validated but too small[/yellow] {subreddit_name} - {subscriber_count} subscribers (minimum {self.min_subscriber_threshold})")
                self.trigger_event("subreddit_validated", {
                    "subreddit": subreddit_name,
                    "status": "too_small",
                    "subscribers": subscriber_count,
                    "min_threshold": self.min_subscriber_threshold
                })
                return None
                
            console.print(f"[green]✓ Validated[/green] {subreddit_name} - {subscriber_count} subscribers")
            self.trigger_event("subreddit_validated", {
                "subreddit": subreddit_name,
                "status": "valid",
                "metadata": metadata,
                "is_niche": subscriber_count < self.niche_threshold
            })
            return metadata
        else:
            console.print(f"[red]✗ Could not validate[/red] {subreddit_name}")
            self.trigger_event("subreddit_validated", {
                "subreddit": subreddit_name,
                "status": "invalid"
            })
            return None
        
    async def validate_subreddits(self, subreddit_list):
        """Validate a list of subreddits and get their metadata using async processing."""
        validated = []
        
        # Limit the number of subreddits to validate per iteration
        limited_list = subreddit_list[:self.max_validations_per_iteration]
        if len(subreddit_list) > self.max_validations_per_iteration:
            console.print(f"[yellow]Limiting validation to {self.max_validations_per_iteration} subreddits this iteration[/yellow]")
            self.trigger_event("validation_limited", {
                "original_count": len(subreddit_list),
                "limited_count": len(limited_list)
            })
        
        # Process subreddits in parallel with a concurrency limit
        # to avoid overwhelming Reddit's API
        concurrency_limit = 3
        semaphore = asyncio.Semaphore(concurrency_limit)
        
        async def validate_with_semaphore(subreddit):
            async with semaphore:
                metadata = await self.validate_subreddit_async(subreddit)
                if metadata:
                    validated.append(metadata)
                
                # Brief delay to avoid rate limiting
                await asyncio.sleep(0.5)
        
        # Create tasks for all subreddits
        tasks = [validate_with_semaphore(subreddit) for subreddit in limited_list]
        
        # Run all validation tasks
        await asyncio.gather(*tasks)
        
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
        
        self.trigger_event("ai_call_started", {
            "call_id": call_id,
            "reason": reason,
            "model": model
        })
        
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
            
            content = completion.choices[0].message.content
            
            self.trigger_event("ai_call_completed", {
                "call_id": call_id,
                "duration": duration,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "content_preview": content[:100] + ("..." if len(content) > 100 else "")
            })
            
            return content
            
        except Exception as e:
            console.print(f"[bold red]❌ API CALL FAILED (Run: {run_id}, Call: {call_id}): {str(e)}[/bold red]")
            
            self.trigger_event("ai_call_failed", {
                "call_id": call_id,
                "error": str(e)
            })
            
            raise e
            
    def generate_search_queries(self, iteration=0, previous_results=None):
        """Generate search queries using AI based on the current state."""
        context = f"""
Product Type: {self.product_type}
Problem Area: {self.problem_area}
Target Audience: {self.target_audience}
"""

        # Add additional context differently based on search mode
        if self.search_mode == "mvp":
            context += f"""
Question/Goal: {self.additional_context or "None provided"}
"""
        else:
            context += f"""
Additional Context: {self.additional_context or "None provided"}
"""

        context += f"""
Current iteration: {iteration + 1} of {self.max_iterations}
"""

        # Add previously found subreddits for context if this isn't the first iteration
        if iteration > 0 and previous_results:
            context += "\nPreviously found subreddits:\n"
            for sub in previous_results:
                subscribers = sub.get('subscribers', 'Unknown')
                context += f"- {sub['subreddit_name']} ({subscribers} subscribers): {sub.get('title', 'No title')}\n"
                
            context += "\nWe need a mix of niche communities (ideally under 500,000 subscribers) and highly relevant larger communities."

        # Base prompt for both modes
        base_prompt = f"""
You are an expert at discovering relevant Reddit communities. Your goal is to generate effective search queries that will help find:

1. Niche subreddits (ideally 2,500-500,000 subscribers) that are highly relevant to the target audience and problem area
2. Larger, but still highly relevant, subreddits that might provide valuable insights 

For context:
{context}
"""

        # Custom prompt based on search mode
        if self.search_mode == "mvp":
            custom_prompt = f"""
Focus on finding subreddits that would be most helpful for answering the user's question or achieving their goal. 
The subreddits should have discussions, insights, or communities that could provide relevant information or 
perspective on the specific question/goal.
"""
        else:
            custom_prompt = f"""
Focus on finding subreddits that would be most helpful for validating the product idea and understanding the 
market needs. The subreddits should have active discussions about similar problems, solutions, or topics relevant 
to the product being developed.
"""

        prompt = base_prompt + custom_prompt + f"""
Please generate 4-6 specific, targeted search queries with a mix of:

1. Specific terminology or jargon used by the target audience
2. Combinations of multiple relevant concepts (e.g., "reddit indie game developers marketing discord")
3. Long-tail searches that might yield specific results
4. Queries targeting both niche communities and larger communities with high relevance 

CRITICAL: Each search query MUST be short and concise (5-7 words maximum) to work effectively with the Reddit search API.
DO NOT create long queries or use entire sentences. Break down concepts into key terms.

EXAMPLES:
Instead of "best subreddits for Subscription-based service providing unlimited custom-built AI marketing automation workflows" 
Use: "marketing automation workflow tools reddit"

Instead of "subreddits dedicated to Marketing agency owners and marketing directors at small to mid-sized agencies" 
Use: "marketing agency directors reddit"

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

        self.trigger_event("generating_queries", {
            "iteration": iteration + 1,
            "max_iterations": self.max_iterations,
            "previous_results_count": len(previous_results) if previous_results else 0
        })

        # Make the API call
        response = self.make_ai_call(
            prompt=prompt,
            reason=f"Generate search queries for iteration {iteration + 1}",
            model="google/gemini-2.5-flash-preview"
        )
        
        try:
            parsed_response = json.loads(response)
            queries = parsed_response.get("search_queries", [])
            reasoning = parsed_response.get("reasoning", "No reasoning provided")
            
            # Ensure queries are concise by limiting length
            concise_queries = []
            for query in queries:
                # Split query into words and limit to 7 words max
                words = query.split()
                if len(words) > 7:
                    query = " ".join(words[:7])
                concise_queries.append(query)
            
            self.trigger_event("queries_generated", {
                "iteration": iteration + 1,
                "queries": concise_queries,
                "reasoning": reasoning
            })
            
            return concise_queries
        except json.JSONDecodeError:
            console.print("[bold red]Error: AI response was not valid JSON[/bold red]")
            console.print(response)
            
            self.trigger_event("queries_generation_failed", {
                "iteration": iteration + 1,
                "error": "Invalid JSON response"
            })
            
            # Fallback to some default queries
            fallback_queries = [
                f"marketing agency subreddits",
                f"reddit marketing automation tools",
                f"specialized marketing forums reddit",
                f"marketing directors reddit communities"
            ]
            
            self.trigger_event("using_fallback_queries", {
                "iteration": iteration + 1,
                "queries": fallback_queries
            })
            
            return fallback_queries
            
    def think(self, validated_subreddits):
        """Evaluate search progress and determine next steps using AI."""
        self.trigger_event("thinking_started", {
            "validated_subreddits_count": len(validated_subreddits)
        })
        
        # Count how many niche vs large subreddits we've found
        niche_count = sum(1 for sub in validated_subreddits if self.min_subscriber_threshold <= sub.get('subscribers', 0) < self.niche_threshold)
        large_count = sum(1 for sub in validated_subreddits if sub.get('subscribers', 0) >= self.niche_threshold)
        
        # Prepare context for the AI
        context = f"""
Product Type: {self.product_type}
Problem Area: {self.problem_area}
Target Audience: {self.target_audience}
"""

        # Add additional context differently based on search mode
        if self.search_mode == "mvp":
            context += f"""
Question/Goal: {self.additional_context or "None provided"}
"""
        else:
            context += f"""
Additional Context: {self.additional_context or "None provided"}
"""

        context += f"""
Search progress:
- Total iterations completed: {self.search_iterations}
- Total validated subreddits found: {len(validated_subreddits)}
- Niche subreddits (2,500-{self.niche_threshold:,} subscribers): {niche_count}
- Large subreddits (over {self.niche_threshold:,} subscribers): {large_count}
"""

        subreddit_info = ""
        for sub in validated_subreddits:
            subreddit_info += f"- {sub['subreddit_name']} ({sub.get('subscribers', 'Unknown')} subscribers): {sub.get('title', 'No title')}\n"
        
        # Base prompt for both modes
        base_prompt = f"""
You are a Reddit community discovery expert.

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
"""

        # Custom prompt based on search mode
        if self.search_mode == "mvp":
            custom_prompt = f"""
IMPORTANT: Focus on communities that can help answer the user's question or achieve their goal. Evaluate 
how well each subreddit aligns with providing valuable insights, perspectives, or discussions that directly 
relate to the question/goal the user has specified. Consider communities where people might be discussing 
similar topics, challenges, or solutions.
"""
        else:
            custom_prompt = f"""
IMPORTANT: Focus on communities that are DIRECTLY related to product validation, startup founders, marketing, 
and copywriting. Do NOT include general technology subreddits (like r/Android, r/Apple) unless there is 
strong evidence they discuss product development and validation frequently.
"""

        prompt = base_prompt + custom_prompt + f"""
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
            
            self.trigger_event("thinking_complete", {
                "evaluation": parsed_response.get("evaluation", "No evaluation provided"),
                "found_sufficient": parsed_response.get("found_sufficient_communities", False),
                "continue_searching": parsed_response.get("continue_searching", True),
                "recommended_strategy": parsed_response.get("recommended_strategy", "No strategy provided"),
                "top_recommendations": parsed_response.get("top_recommendations", [])
            })
            
            return parsed_response
        except json.JSONDecodeError:
            console.print("[bold red]Error: AI response was not valid JSON[/bold red]")
            console.print(response)
            
            self.trigger_event("thinking_failed", {
                "error": "Invalid JSON response"
            })
            
            # Default response
            default_response = {
                "evaluation": "Unable to properly evaluate results",
                "found_sufficient_communities": len(validated_subreddits) >= 6,
                "continue_searching": len(validated_subreddits) < 6 and self.search_iterations < self.max_iterations,
                "recommended_strategy": "Try more specific search terms"
            }
            
            self.trigger_event("using_fallback_thinking", default_response)
            
            return default_response
    
    async def run(self):
        """Run the search agent with an agentic loop."""
        console.print(f"\n[bold cyan]===== STARTING SEARCH AGENT RUN (ID: {run_id}) =====[/bold cyan]")
        
        self.trigger_event("search_started", {
            "run_id": run_id,
            "product_type": self.product_type,
            "problem_area": self.problem_area,
            "target_audience": self.target_audience,
            "additional_context": self.additional_context
        })
        
        sufficient_results = False
        
        while not sufficient_results and self.search_iterations < self.max_iterations:
            console.print(f"\n[bold cyan]===== ITERATION {self.search_iterations + 1} =====[/bold cyan]")
            
            self.trigger_event("iteration_started", {
                "iteration": self.search_iterations + 1,
                "max_iterations": self.max_iterations
            })
            
            # Generate search queries based on iteration
            if self.search_iterations == 0:
                # First iteration: use basic queries to establish a baseline
                search_queries = [
                    f"best subreddits for {self.product_type} founders",
                    f"niche subreddits for {self.problem_area}",
                    f"reddit communities specifically for {self.target_audience}",
                    f"subreddits dedicated to {self.problem_area} for {self.target_audience}",
                    f"specialized {self.product_type} subreddits under 100k",
                    f"trending subreddits for {self.product_type} {self.problem_area}"
                ]
                
                self.trigger_event("using_default_queries", {
                    "iteration": self.search_iterations + 1,
                    "queries": search_queries
                })
            else:
                # Use AI to generate more targeted queries based on previous results
                search_queries = self.generate_search_queries(
                    iteration=self.search_iterations, 
                    previous_results=self.validated_subreddits
                )
            
            # Display generated queries
            console.print(f"\n[bold cyan]Generated {len(search_queries)} search queries for this iteration[/bold cyan]")
            for i, query in enumerate(search_queries):
                console.print(f"  [bold]{i+1}.[/bold] {query}")
            
            # Perform searches in parallel using asyncio
            iteration_results = []
            tasks = [self.search_web(query) for query in search_queries]
            search_results_list = await asyncio.gather(*tasks)
            
            # Flatten results from all queries
            for results in search_results_list:
                iteration_results.extend(results)
                self.all_search_results.extend(results)
            
            # Extract and validate subreddits from this iteration's results
            potential_subreddits = self.extract_subreddits_from_results(iteration_results)
            console.print(f"\n[bold cyan]Found {len(potential_subreddits)} potential subreddits in this iteration[/bold cyan]")
            
            # Skip if no potential subreddits found
            if not potential_subreddits:
                console.print("[yellow]No potential subreddits found in this iteration. Continuing to next iteration.[/yellow]")
                self.search_iterations += 1
                continue
            
            self.trigger_event("potential_subreddits_found", {
                "iteration": self.search_iterations + 1,
                "count": len(potential_subreddits),
                "subreddits": potential_subreddits
            })
            
            # Screen subreddits for relevance before validation
            relevant_subreddits = await self.screen_subreddits_for_relevance(potential_subreddits)
            
            # Skip if no relevant subreddits found
            if not relevant_subreddits:
                console.print("[yellow]No relevant subreddits found in this iteration. Continuing to next iteration.[/yellow]")
                self.search_iterations += 1
                continue
            
            # Only validate new subreddits we haven't validated before
            already_validated = {sub['subreddit_name'].lower() for sub in self.validated_subreddits}
            new_to_validate = [sub for sub in relevant_subreddits if sub.lower() not in already_validated]
            
            console.print(f"\n[bold cyan]Validating {len(new_to_validate)} new subreddits...[/bold cyan]")
            
            self.trigger_event("validation_started", {
                "iteration": self.search_iterations + 1,
                "count": len(new_to_validate),
                "subreddits": new_to_validate
            })
            
            # Validate subreddits in parallel
            new_validated = await self.validate_subreddits(new_to_validate)
            self.validated_subreddits.extend(new_validated)
            
            console.print(f"\n[bold green]Found {len(new_validated)} new valid subreddits in iteration {self.search_iterations + 1}[/bold green]")
            
            self.trigger_event("validation_complete", {
                "iteration": self.search_iterations + 1,
                "new_valid_count": len(new_validated),
                "total_valid_count": len(self.validated_subreddits)
            })
            
            # Use the "Think" function to evaluate progress and decide next steps
            if len(self.validated_subreddits) > 0:
                evaluation = self.think(self.validated_subreddits)
                
                console.print(f"\n[bold cyan]Evaluation of search progress:[/bold cyan]")
                console.print(evaluation.get("evaluation", "No evaluation provided"))
                
                sufficient_results = evaluation.get("found_sufficient_communities", False)
                should_continue = evaluation.get("continue_searching", True)
                
                # Enforce minimum iteration count
                if sufficient_results and self.search_iterations + 1 < self.min_iterations:
                    console.print("\n[bold yellow]🔄 Found sufficient communities, but enforcing minimum iteration count.[/bold yellow]")
                    sufficient_results = False
                    should_continue = True
                    
                if sufficient_results:
                    console.print("\n[bold green]✅ Found sufficient communities! Ending search.[/bold green]")
                    self.trigger_event("sufficient_results_found", {
                        "iteration": self.search_iterations + 1,
                        "count": len(self.validated_subreddits)
                    })
                    break
                    
                if not should_continue and self.search_iterations + 1 >= self.min_iterations:
                    console.print("\n[bold yellow]🛑 AI suggests stopping the search. We have the best results we're likely to find.[/bold yellow]")
                    self.trigger_event("search_stopping_early", {
                        "iteration": self.search_iterations + 1,
                        "reason": "AI recommendation",
                        "evaluation": evaluation.get("evaluation", "No evaluation provided")
                    })
                    break
                elif not should_continue:
                    console.print("\n[bold yellow]🔄 AI suggests stopping, but enforcing minimum iteration count.[/bold yellow]")
                    
                console.print(f"\n[bold cyan]Strategy for next iteration:[/bold cyan] {evaluation.get('recommended_strategy', 'No strategy provided')}")
            
            # Increment iteration counter
            self.search_iterations += 1
            
            self.trigger_event("iteration_complete", {
                "iteration": self.search_iterations,
                "new_valid_subreddits": len(new_validated),
                "total_valid_subreddits": len(self.validated_subreddits),
                "continue": not sufficient_results and self.search_iterations < self.max_iterations
            })
        
        # Search complete - prepare categorized results
        console.print(f"\n[bold green]===== SEARCH COMPLETE ({self.search_iterations} iterations) =====[/bold green]")
        console.print(f"[bold green]Found {len(self.validated_subreddits)} validated subreddits[/bold green]")
        
        # Categorize subreddits by size
        large_subreddits = []
        medium_subreddits = []
        niche_subreddits = []
        
        for sub in self.validated_subreddits:
            sub_count = sub.get('subscribers', 0)
            if sub_count >= 1000000:  # Over 1M
                large_subreddits.append(sub)
            elif sub_count >= self.niche_threshold:  # Over threshold but under 1M
                medium_subreddits.append(sub)
            else:  # Under threshold
                niche_subreddits.append(sub)
                
        # Sort each category by subscriber count
        large_subreddits.sort(key=lambda x: x.get('subscribers', 0), reverse=True)
        medium_subreddits.sort(key=lambda x: x.get('subscribers', 0), reverse=True)
        niche_subreddits.sort(key=lambda x: x.get('subscribers', 0), reverse=True)
        
        # Print the categorized results - simplified output
        console.print(f"\n[bold cyan]===== SUBREDDIT RECOMMENDATIONS =====[/bold cyan]")
        
        # Display a summary table for easier viewing
        table = Table(title="Validated Subreddits by Category", show_header=True, header_style="bold")
        table.add_column("Subreddit", style="cyan")
        table.add_column("Subscribers", justify="right")
        table.add_column("Category", style="yellow")
        table.add_column("Description")
        
        # Add large subreddits
        if large_subreddits:
            console.print(f"\n[bold yellow]LARGE COMMUNITIES ({len(large_subreddits)})[/bold yellow]")
            for sub in large_subreddits:
                table.add_row(
                    sub['subreddit_name'],
                    f"{sub.get('subscribers', 0):,}",
                    "Large",
                    sub.get('title', 'No title')[:60] + ('...' if len(sub.get('title', '')) > 60 else '')
                )
                
        # Add medium subreddits
        if medium_subreddits:
            console.print(f"\n[bold green]MEDIUM COMMUNITIES ({len(medium_subreddits)})[/bold green]")
            for sub in medium_subreddits:
                table.add_row(
                    sub['subreddit_name'],
                    f"{sub.get('subscribers', 0):,}",
                    "Medium",
                    sub.get('title', 'No title')[:60] + ('...' if len(sub.get('title', '')) > 60 else '')
                )
                
        # Add niche subreddits
        if niche_subreddits:
            console.print(f"\n[bold cyan]NICHE COMMUNITIES ({len(niche_subreddits)})[/bold cyan]")
            for sub in niche_subreddits:
                table.add_row(
                    sub['subreddit_name'],
                    f"{sub.get('subscribers', 0):,}",
                    "Niche",
                    sub.get('title', 'No title')[:60] + ('...' if len(sub.get('title', '')) > 60 else '')
                )
        
        # Display the table
        console.print(table)
        
        # Display count of API calls made
        console.print(f"\n[bold cyan]Total API calls made: {api_call_count}[/bold cyan]")
        
        # Prepare a more structured result for further processing or API response
        result = {
            "run_id": run_id,
            "iterations": self.search_iterations,
            "total_valid_subreddits": len(self.validated_subreddits),
            "api_calls": api_call_count,
            "categories": {
                "large_communities": [self._format_subreddit_for_output(sub) for sub in large_subreddits],
                "medium_communities": [self._format_subreddit_for_output(sub) for sub in medium_subreddits],
                "niche_communities": [self._format_subreddit_for_output(sub) for sub in niche_subreddits]
            },
            "all_subreddits": [self._format_subreddit_for_output(sub) for sub in self.validated_subreddits]
        }
        
        self.trigger_event("search_complete", result)
        
        # Ask if the user wants to select subreddits for analysis
        console.print("\n[bold cyan]Would you like to select subreddits for analysis?[/bold cyan]")
        should_select = Prompt.ask("Select subreddits now?", choices=["y", "n"], default="y")
        
        if should_select.lower() == "y":
            # Import the subreddit_selection module here to avoid circular imports
            from subreddit_selection import select_subreddits_for_analysis
            
            try:
                # Use the subreddit selection UI from the separate module with proper parameters
                select_subreddits_for_analysis(
                    result, 
                    self.target_audience,
                    self.problem_area,
                    self.product_type,
                    self.additional_context
                )
            except TypeError as e:
                # Fallback if there's a parameter mismatch 
                console.print(f"[yellow]Error in subreddit selection: {str(e)}[/yellow]")
                console.print("[yellow]Attempting with fewer parameters...[/yellow]")
                
                # Try with only required parameters
                select_subreddits_for_analysis(
                    result,
                    self.target_audience,
                    self.problem_area,
                    self.product_type
                )
        
        # Clear cache
        clear_cache()
        
        return result
        
    def _format_subreddit_for_output(self, subreddit_data):
        """Format subreddit data for output, with cleaner structure"""
        return {
            "name": subreddit_data.get('subreddit_name', ''),
            "title": subreddit_data.get('title', ''),
            "subscribers": subreddit_data.get('subscribers', 0),
            "description": subreddit_data.get('public_description', ''),
            "url": subreddit_data.get('url', ''),
            "created_utc": subreddit_data.get('created_utc', 0),
            "is_niche": subreddit_data.get('subscribers', 0) < self.niche_threshold,
            "active_users": subreddit_data.get('active_user_count', 0),
            "selection_reason": subreddit_data.get('selection_reason', "Relevant community for market research")
        }

# Simple example of how to use this agent
if __name__ == "__main__":
    import argparse
    
    # Check for required environment variables
    if not os.getenv("OPENROUTER_API_KEY"):
        console.print("[bold red]Error: OPENROUTER_API_KEY is not set. This is required for AI functionality.[/bold red]")
        console.print("[yellow]Please set this in your .env file or environment and try again.[/yellow]")
        exit(1)
        
    # Warn about optional environment variables
    if not os.getenv("GUMLOOP_API_KEY"):
        console.print("[yellow]Warning: GUMLOOP_API_KEY is not set. You won't be able to send analysis requests.[/yellow]")
    
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
    
    validated_subreddits = asyncio.run(agent.run()) 