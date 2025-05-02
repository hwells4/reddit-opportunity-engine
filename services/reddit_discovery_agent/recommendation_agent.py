import os
import json
import time
from rich.console import Console
from dotenv import load_dotenv
from openai import OpenAI
import uuid
from subreddit_utils import clear_cache

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

class RecommendationAgent:
    def __init__(self, product_type, problem_area, target_audience, additional_context=None):
        self.product_type = product_type
        self.problem_area = problem_area
        self.target_audience = target_audience
        self.additional_context = additional_context
        
        # Configuration
        self.min_recommendations = 6
        self.max_recommendations = 8
        self.niche_threshold = 500000  # Subreddits with fewer subscribers than this are considered niche
        self.min_subscriber_threshold = 2500  # Minimum number of subscribers for a subreddit to be useful
    
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
    
    def generate_recommendations(self, validated_subreddits):
        """Generate recommendations from validated subreddits."""
        console.print(f"\n[bold cyan]===== GENERATING RECOMMENDATIONS =====[/bold cyan]")
        
        # Count how many niche vs large subreddits we have
        niche_subreddits = [sub for sub in validated_subreddits if self.min_subscriber_threshold <= sub.get('subscribers', 0) < self.niche_threshold]
        large_subreddits = [sub for sub in validated_subreddits if sub.get('subscribers', 0) >= self.niche_threshold]
        console.print(f"Found {len(niche_subreddits)} niche subreddits and {len(large_subreddits)} large subreddits out of {len(validated_subreddits)} total validated")
        
        # Prepare context for the AI
        subreddit_info = ""
        for i, sub in enumerate(validated_subreddits):
            subreddit_info += f"Subreddit {i+1}: {sub['subreddit_name']}\n"
            subreddit_info += f"Title: {sub['title']}\n"
            subreddit_info += f"Subscribers: {sub['subscribers']}\n"
            subreddit_info += f"Description: {sub['public_description']}\n"
            subreddit_info += f"NSFW: {sub['over18']}\n"
            subreddit_info += f"Active users: {sub['active_user_count']}\n\n"
        
        prompt = f"""
You are an expert Reddit Community Discovery Specialist. Your goal is to help entrepreneurs find the most relevant subreddits for researching product opportunities based on their stated interests and needs.

Carefully analyze the user's focus area:
- Product Type: {self.product_type}
- Problem Area: {self.problem_area}
- Target Audience: {self.target_audience}
- Additional Context: {self.additional_context or "None provided"}

Based on the validated subreddits data, please provide:
1. {self.min_recommendations}-{self.max_recommendations} relevant subreddits with the following details for each:
   - Subreddit name (starting with r/)
   - Subscriber count (use the actual values provided in the validated data)
   - Why this subreddit is relevant (2-3 sentences)
   - Typical content types found in this subreddit
   - How the audience aligns with the target audience

When choosing which subreddits to recommend:
- Aim for a balanced mix of niche communities (2,500-{self.niche_threshold:,} subscribers) and larger highly relevant communities
- Include large subreddits if they are highly relevant to the topic - don't exclude based on size alone
- Prioritize relevance to the problem area and target audience over size
- Avoid NSFW subreddits unless specifically requested
- Focus on quality over quantity - but provide {self.min_recommendations}-{self.max_recommendations} recommendations for comprehensive analysis

2. 3-5 specific search term suggestions to use within these subreddits

Subreddit information:
{subreddit_info}

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
  "search_suggestions": ["term1", "term2", "term3"],
  "search_insights": "Brief analysis of the search results and why these recommendations are particularly valuable for the user's needs."
}}
"""

        # Make the API call
        response = self.make_ai_call(
            prompt=prompt,
            reason="Generate final subreddit recommendations",
            model="google/gemini-2.5-flash-preview"
        )
        
        try:
            parsed_response = json.loads(response)
            
            # Display recommendations
            if "subreddit_recommendations" in parsed_response:
                console.print("\n[bold cyan]Final Recommendations:[/bold cyan]")
                for i, rec in enumerate(parsed_response["subreddit_recommendations"]):
                    console.print(f"  [bold]{i+1}.[/bold] {rec['subreddit_name']} ({rec.get('subscriber_count', 'Unknown')} subscribers)")
                    console.print(f"     Relevance: {rec['relevance_explanation'][:100]}...")
            
            # Display search terms
            if "search_suggestions" in parsed_response:
                console.print("\n[bold cyan]Recommended Search Terms:[/bold cyan]")
                for term in parsed_response["search_suggestions"]:
                    console.print(f"  - {term}")
            
            # Display insights
            if "search_insights" in parsed_response:
                console.print("\n[bold cyan]Search Insights:[/bold cyan]")
                console.print(parsed_response["search_insights"])
            
            # Display API call count
            console.print(f"\n[bold cyan]Total API calls made: {api_call_count}[/bold cyan]")
            
            return parsed_response
            
        except json.JSONDecodeError:
            console.print("[bold red]Error: AI response was not valid JSON[/bold red]")
            console.print(response)
            return None
    
def main(validated_subreddits, product_type, problem_area, target_audience, additional_context=None):
    """Generate recommendations from validated subreddits."""
    agent = RecommendationAgent(
        product_type=product_type,
        problem_area=problem_area,
        target_audience=target_audience,
        additional_context=additional_context
    )
    
    recommendations = agent.generate_recommendations(validated_subreddits)
    
    # Clear cache
    clear_cache()
    
    return recommendations 