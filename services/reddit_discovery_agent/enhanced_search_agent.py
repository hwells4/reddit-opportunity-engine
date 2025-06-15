import os
import time
import uuid
import json
import asyncio
import aiohttp
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from dotenv import load_dotenv
from openai import OpenAI
import re
import requests
from typing import List, Dict, Any, Optional, Set
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

class EnhancedSearchAgent:
    def __init__(self, product_type, problem_area, target_audience, additional_context=None, search_mode="validation"):
        self.product_type = product_type
        self.problem_area = problem_area
        self.target_audience = target_audience
        self.additional_context = additional_context or ""
        self.search_mode = search_mode
        self.perplexity_api_key = os.getenv("PERPLEXITY_API_KEY")
        self.firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")
        
        # Validate API keys
        if not self.perplexity_api_key:
            console.print("[red]Warning: PERPLEXITY_API_KEY not found. Perplexity search will be disabled.[/red]")
        if not self.firecrawl_api_key:
            console.print("[red]Warning: FIRECRAWL_API_KEY not found. Firecrawl search will be disabled.[/red]")

    async def discover_subreddits(self) -> Dict[str, Any]:
        """
        Main method to discover relevant subreddits using multiple approaches
        """
        console.print(Panel.fit(
            f"🔍 Enhanced Subreddit Discovery\n"
            f"Product: {self.product_type}\n"
            f"Problem: {self.problem_area}\n"
            f"Audience: {self.target_audience}",
            title="Starting Discovery"
        ))
        
        all_subreddits = set()
        discovery_results = {
            "perplexity_subreddits": [],
            "firecrawl_subreddits": [],
            "validated_subreddits": [],
            "final_recommendations": [],
            "search_queries_used": [],
            "discovery_summary": ""
        }
        
        # 1. Use Perplexity for intelligent subreddit discovery
        if self.perplexity_api_key:
            perplexity_results = await self._discover_with_perplexity()
            discovery_results["perplexity_subreddits"] = perplexity_results
            all_subreddits.update([r["name"] for r in perplexity_results])
        
        # 2. Use Firecrawl to search Reddit for relevant discussions
        if self.firecrawl_api_key:
            firecrawl_results = await self._discover_with_firecrawl()
            discovery_results["firecrawl_subreddits"] = firecrawl_results
            all_subreddits.update([r["name"] for r in firecrawl_results])
        
        # 3. Validate and enrich subreddit information
        validated_subreddits = await self._validate_subreddits(list(all_subreddits))
        discovery_results["validated_subreddits"] = validated_subreddits
        
        # 4. Generate final recommendations using AI
        final_recommendations = await self._generate_final_recommendations(validated_subreddits)
        discovery_results["final_recommendations"] = final_recommendations
        
        # 5. Create summary
        discovery_results["discovery_summary"] = self._create_discovery_summary(discovery_results)
        
        return discovery_results

    async def _discover_with_perplexity(self) -> List[Dict[str, Any]]:
        """
        Use Perplexity AI to intelligently discover relevant subreddits
        """
        console.print("[blue]🧠 Using Perplexity AI for intelligent subreddit discovery...[/blue]")
        
        # Create targeted queries for different aspects
        queries = [
            f"What are the best Reddit communities (subreddits) for {self.target_audience} who are dealing with {self.problem_area}?",
            f"Which subreddits discuss {self.product_type} and related solutions?",
            f"What Reddit communities would be interested in {self.product_type} for {self.problem_area}?",
            f"Best subreddits for {self.target_audience} seeking help with {self.problem_area} and similar challenges"
        ]
        
        all_subreddits = []
        
        for query in queries:
            try:
                subreddits = await self._query_perplexity(query)
                all_subreddits.extend(subreddits)
                await asyncio.sleep(1)  # Rate limiting
            except Exception as e:
                console.print(f"[red]Error with Perplexity query: {e}[/red]")
        
        # Deduplicate and return
        unique_subreddits = {}
        for sub in all_subreddits:
            if sub["name"] not in unique_subreddits:
                unique_subreddits[sub["name"]] = sub
        
        return list(unique_subreddits.values())

    async def _query_perplexity(self, query: str) -> List[Dict[str, Any]]:
        """
        Query Perplexity API for subreddit recommendations
        """
        url = "https://api.perplexity.ai/chat/completions"
        
        payload = {
            "model": "llama-3.1-sonar-small-128k-online",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a Reddit expert. When asked about subreddits, provide specific subreddit names (with r/ prefix) and brief explanations of why they're relevant. Focus on active communities with engaged users."
                },
                {
                    "role": "user",
                    "content": f"{query}\n\nPlease provide specific subreddit names (with r/ prefix) and explain why each is relevant. Focus on communities that are active and have engaged discussions about these topics."
                }
            ],
            "max_tokens": 1000,
            "temperature": 0.2,
            "top_p": 0.9,
            "return_citations": True,
            "search_domain_filter": ["reddit.com"],
            "return_images": False,
            "return_related_questions": False,
            "search_recency_filter": "month",
            "top_k": 0,
            "stream": False,
            "presence_penalty": 0,
            "frequency_penalty": 1
        }
        
        headers = {
            "Authorization": f"Bearer {self.perplexity_api_key}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    content = data["choices"][0]["message"]["content"]
                    return self._extract_subreddits_from_text(content, source="perplexity")
                else:
                    console.print(f"[red]Perplexity API error: {response.status}[/red]")
                    return []

    async def _discover_with_firecrawl(self) -> List[Dict[str, Any]]:
        """
        Use Firecrawl to search Reddit for relevant discussions and extract subreddits
        """
        console.print("[green]🔥 Using Firecrawl to search Reddit discussions...[/green]")
        
        # Create search queries for Reddit
        search_queries = [
            f"{self.product_type} {self.problem_area} site:reddit.com",
            f"{self.target_audience} {self.problem_area} reddit community",
            f"best subreddit {self.product_type} {self.target_audience}",
            f"{self.problem_area} help reddit {self.target_audience}"
        ]
        
        all_subreddits = []
        
        for query in search_queries:
            try:
                subreddits = await self._search_with_firecrawl(query)
                all_subreddits.extend(subreddits)
                await asyncio.sleep(2)  # Rate limiting
            except Exception as e:
                console.print(f"[red]Error with Firecrawl search: {e}[/red]")
        
        # Deduplicate
        unique_subreddits = {}
        for sub in all_subreddits:
            if sub["name"] not in unique_subreddits:
                unique_subreddits[sub["name"]] = sub
        
        return list(unique_subreddits.values())

    async def _search_with_firecrawl(self, query: str) -> List[Dict[str, Any]]:
        """
        Search using Firecrawl and extract subreddit information
        """
        url = "https://api.firecrawl.dev/v0/search"
        
        payload = {
            "query": query,
            "pageOptions": {
                "onlyMainContent": True
            },
            "limit": 5
        }
        
        headers = {
            "Authorization": f"Bearer {self.firecrawl_api_key}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    subreddits = []
                    
                    for result in data.get("data", []):
                        # Extract subreddits from URLs and content
                        url_subreddits = self._extract_subreddits_from_url(result.get("url", ""))
                        content_subreddits = self._extract_subreddits_from_text(
                            result.get("markdown", ""), 
                            source="firecrawl"
                        )
                        
                        subreddits.extend(url_subreddits)
                        subreddits.extend(content_subreddits)
                    
                    return subreddits
                else:
                    console.print(f"[red]Firecrawl API error: {response.status}[/red]")
                    return []

    def _extract_subreddits_from_url(self, url: str) -> List[Dict[str, Any]]:
        """
        Extract subreddit names from Reddit URLs
        """
        subreddits = []
        
        # Match patterns like reddit.com/r/subredditname
        pattern = r'reddit\.com/r/([a-zA-Z0-9_]+)'
        matches = re.findall(pattern, url)
        
        for match in matches:
            subreddits.append({
                "name": match,
                "source": "url_extraction",
                "relevance_reason": "Found in Reddit URL",
                "confidence": 0.8
            })
        
        return subreddits

    def _extract_subreddits_from_text(self, text: str, source: str) -> List[Dict[str, Any]]:
        """
        Extract subreddit names from text content
        """
        subreddits = []
        
        # Match patterns like r/subredditname or /r/subredditname
        patterns = [
            r'r/([a-zA-Z0-9_]+)',
            r'/r/([a-zA-Z0-9_]+)'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                # Skip common false positives
                if match.lower() not in ['all', 'popular', 'random', 'friends']:
                    # Extract context around the subreddit mention
                    context = self._extract_context_around_subreddit(text, match)
                    
                    subreddits.append({
                        "name": match,
                        "source": source,
                        "relevance_reason": context,
                        "confidence": 0.7
                    })
        
        return subreddits

    def _extract_context_around_subreddit(self, text: str, subreddit: str) -> str:
        """
        Extract context around a subreddit mention to understand relevance
        """
        # Find the subreddit mention in text
        pattern = rf'r/{re.escape(subreddit)}'
        match = re.search(pattern, text, re.IGNORECASE)
        
        if match:
            start = max(0, match.start() - 100)
            end = min(len(text), match.end() + 100)
            context = text[start:end].strip()
            return context
        
        return "Mentioned in relevant discussion"

    async def _validate_subreddits(self, subreddit_names: List[str]) -> List[Dict[str, Any]]:
        """
        Validate subreddits by checking their existence and gathering metadata
        """
        console.print(f"[yellow]🔍 Validating {len(subreddit_names)} discovered subreddits...[/yellow]")
        
        validated = []
        
        for name in subreddit_names:
            try:
                # Use existing subreddit_utils function
                info = get_subreddit_info(name)
                if info and info.get("exists", False):
                    validated.append({
                        "name": name,
                        "subscribers": info.get("subscribers", 0),
                        "description": info.get("description", ""),
                        "is_active": info.get("is_active", False),
                        "over_18": info.get("over_18", False),
                        "validation_status": "valid"
                    })
                else:
                    console.print(f"[dim]Subreddit r/{name} not found or private[/dim]")
            except Exception as e:
                console.print(f"[red]Error validating r/{name}: {e}[/red]")
        
        return validated

    async def _generate_final_recommendations(self, validated_subreddits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Use AI to analyze validated subreddits and generate final recommendations
        """
        console.print("[blue]🤖 Generating AI-powered recommendations...[/blue]")
        
        if not validated_subreddits:
            return []
        
        # Prepare subreddit data for AI analysis
        subreddit_data = []
        for sub in validated_subreddits:
            subreddit_data.append({
                "name": sub["name"],
                "subscribers": sub["subscribers"],
                "description": sub["description"][:200],  # Truncate for token limits
                "is_active": sub["is_active"]
            })
        
        prompt = f"""
        Analyze these subreddits for relevance to a {self.product_type} targeting {self.target_audience} with {self.problem_area}.

        Subreddits to analyze:
        {json.dumps(subreddit_data, indent=2)}

        Additional context: {self.additional_context}

        Please categorize these subreddits into:
        1. Primary Communities (highest relevance, direct target audience)
        2. Secondary Communities (good relevance, broader audience)
        3. Niche Communities (specific use cases or segments)

        For each subreddit, provide:
        - Category (primary/secondary/niche)
        - Relevance score (1-10)
        - Specific reason for relevance
        - Recommended approach for engagement

        Format as JSON with this structure:
        {{
            "primary": [
                {{
                    "name": "subreddit_name",
                    "relevance_score": 9,
                    "relevance_reason": "specific reason",
                    "engagement_approach": "recommended strategy"
                }}
            ],
            "secondary": [...],
            "niche": [...]
        }}
        """
        
        try:
            response = client.chat.completions.create(
                model="anthropic/claude-3.5-sonnet",
                messages=[
                    {"role": "system", "content": "You are a Reddit marketing expert. Analyze subreddits for marketing relevance and provide strategic recommendations."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=2000,
                temperature=0.3
            )
            
            content = response.choices[0].message.content
            
            # Try to parse JSON from the response
            try:
                # Extract JSON from the response (it might be wrapped in markdown)
                json_match = re.search(r'```json\n(.*?)\n```', content, re.DOTALL)
                if json_match:
                    json_str = json_match.group(1)
                else:
                    # Try to find JSON without markdown wrapper
                    json_match = re.search(r'\{.*\}', content, re.DOTALL)
                    json_str = json_match.group(0) if json_match else content
                
                recommendations = json.loads(json_str)
                return recommendations
                
            except json.JSONDecodeError:
                console.print("[red]Failed to parse AI recommendations as JSON[/red]")
                return self._create_fallback_recommendations(validated_subreddits)
                
        except Exception as e:
            console.print(f"[red]Error generating AI recommendations: {e}[/red]")
            return self._create_fallback_recommendations(validated_subreddits)

    def _create_fallback_recommendations(self, validated_subreddits: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """
        Create basic recommendations when AI analysis fails
        """
        # Sort by subscriber count and activity
        sorted_subs = sorted(
            validated_subreddits, 
            key=lambda x: (x["is_active"], x["subscribers"]), 
            reverse=True
        )
        
        recommendations = {
            "primary": [],
            "secondary": [],
            "niche": []
        }
        
        for i, sub in enumerate(sorted_subs):
            category = "primary" if i < 3 else "secondary" if i < 8 else "niche"
            
            recommendations[category].append({
                "name": sub["name"],
                "relevance_score": max(5, 10 - i),
                "relevance_reason": f"Active community with {sub['subscribers']} subscribers",
                "engagement_approach": "Research community guidelines and engage authentically"
            })
        
        return recommendations

    def _create_discovery_summary(self, results: Dict[str, Any]) -> str:
        """
        Create a summary of the discovery process
        """
        total_found = len(results["validated_subreddits"])
        perplexity_count = len(results["perplexity_subreddits"])
        firecrawl_count = len(results["firecrawl_subreddits"])
        
        primary_count = len(results["final_recommendations"].get("primary", []))
        secondary_count = len(results["final_recommendations"].get("secondary", []))
        niche_count = len(results["final_recommendations"].get("niche", []))
        
        summary = f"""
Enhanced Subreddit Discovery Summary:

🔍 Discovery Sources:
- Perplexity AI: {perplexity_count} subreddits found
- Firecrawl Search: {firecrawl_count} subreddits found
- Total Validated: {total_found} active subreddits

📊 Final Recommendations:
- Primary Communities: {primary_count}
- Secondary Communities: {secondary_count}  
- Niche Communities: {niche_count}

🎯 Search Focus:
- Product Type: {self.product_type}
- Problem Area: {self.problem_area}
- Target Audience: {self.target_audience}
        """
        
        return summary.strip()

    def display_results(self, results: Dict[str, Any]):
        """
        Display the discovery results in a formatted way
        """
        console.print(Panel.fit(results["discovery_summary"], title="Discovery Summary"))
        
        # Display recommendations by category
        for category in ["primary", "secondary", "niche"]:
            if category in results["final_recommendations"]:
                recommendations = results["final_recommendations"][category]
                if recommendations:
                    table = Table(title=f"{category.title()} Communities")
                    table.add_column("Subreddit", style="cyan")
                    table.add_column("Score", style="green")
                    table.add_column("Relevance Reason", style="yellow")
                    
                    for rec in recommendations:
                        table.add_row(
                            f"r/{rec['name']}", 
                            str(rec['relevance_score']),
                            rec['relevance_reason'][:60] + "..." if len(rec['relevance_reason']) > 60 else rec['relevance_reason']
                        )
                    
                    console.print(table)
                    console.print()

# Example usage function
async def main():
    """
    Example usage of the EnhancedSearchAgent
    """
    # Example for virtual organizing business
    agent = EnhancedSearchAgent(
        product_type="Virtual organizing services and home organization solutions",
        problem_area="Feeling overwhelmed by clutter and disorganization at home",
        target_audience="Busy professionals and parents who need help organizing their homes",
        additional_context="Offers virtual consultations, organizing courses, and subscription services for ongoing support"
    )
    
    results = await agent.discover_subreddits()
    agent.display_results(results)
    
    return results

if __name__ == "__main__":
    asyncio.run(main()) 