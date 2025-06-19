#!/usr/bin/env python
"""
Subtext MVP Flow - Enhanced Version
--------------
An interactive flow for the Subtext MVP mode using enhanced AI discovery
for superior subreddit finding capabilities.
"""

import os
import asyncio
import requests
import uuid
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.markdown import Markdown

# Import enhanced discovery instead of old search agent
try:
    from enhanced_search_agent import EnhancedSearchAgent
    ENHANCED_AVAILABLE = True
    console = Console()
    console.print("[green]✅ Enhanced AI Discovery Available[/green]")
except ImportError:
    from search_agent import SearchAgent
    ENHANCED_AVAILABLE = False
    console = Console()
    console.print("[yellow]⚠️ Enhanced discovery not available, using fallback[/yellow]")

from subreddit_selection import select_subreddits_for_analysis

async def main():
    # Welcome message
    console.print(Panel.fit(
        "[bold]Welcome to Subtext MVP![/bold]\n\n"
        "Subtext MVP helps you find Reddit communities that can answer your questions "
        "or help you achieve your marketing and product goals."
    ))
    
    console.print(Markdown("## Let's get started with your question or goal:"))
    
    # Get the main question or goal
    question_goal = Prompt.ask(
        "[bold cyan]What question are you trying to answer or goal are you trying to achieve?[/bold cyan] "
        "(e.g., 'How should I message my new feature to my audience?', 'Which product launch should I prioritize?')",
        default="How should I message my product to attract customers from my competitors?"
    )
    
    # Get product information through prompts
    product_type = Prompt.ask(
        "[bold cyan]What type of product are you building?[/bold cyan]",
        default="SaaS Tool"
    )
    
    problem_area = Prompt.ask(
        "[bold cyan]What problem does your product solve?[/bold cyan]",
        default="Finding niche communities"
    )
    
    target_audience = Prompt.ask(
        "[bold cyan]Who is your target audience?[/bold cyan]",
        default="Startup founders and marketers"
    )
    
    # Confirm inputs before proceeding
    console.print("\n[bold]Here's what we'll be searching for:[/bold]")
    console.print(f"Question/Goal: [cyan]{question_goal}[/cyan]")
    console.print(f"Product Type: [cyan]{product_type}[/cyan]")
    console.print(f"Problem Area: [cyan]{problem_area}[/cyan]")
    console.print(f"Target Audience: [cyan]{target_audience}[/cyan]")
    
    proceed = Prompt.ask(
        "\nLook good?", 
        choices=["y", "n"], 
        default="y"
    )
    
    if proceed.lower() != "y":
        console.print("[yellow]Let's try again.[/yellow]")
        return await main()
    
    # Create run in database first
    console.print("[cyan]🗃️ Creating run record...[/cyan]")
    
    try:
        api_base = os.getenv("API_BASE_URL", "http://localhost:3000")
        response = requests.post(f"{api_base}/api/create-run", json={
            "user_question": question_goal,
            "problem_area": problem_area,
            "target_audience": target_audience,
            "product_type": product_type,
            "product_name": "MVP Run"
        })
        
        if response.status_code == 200:
            run_data = response.json()
            run_id = run_data["run_id"]
            console.print(f"[green]✅ Run created: {run_id}[/green]")
            
            # Store run_id for use in Gumloop webhook
            os.environ["CURRENT_RUN_ID"] = run_id
            
        else:
            console.print(f"[red]❌ Failed to create run: {response.text}[/red]")
            console.print("[yellow]Continuing without database tracking...[/yellow]")
            run_id = None
            
    except Exception as e:
        console.print(f"[red]❌ Error creating run: {e}[/red]")
        console.print("[yellow]Continuing without database tracking...[/yellow]")
        run_id = None
    
    console.print(Panel.fit(
        "[bold]Starting subreddit discovery - this may take a few minutes![/bold]\n\n"
        f"Using: {'🚀 Enhanced AI Discovery (o3/Claude 4 Sonnet/Perplexity)' if ENHANCED_AVAILABLE else '📊 Traditional Discovery (Fallback)'}\n\n"
        "We'll search Reddit communities to find the best ones to help answer your question or achieve your goal."
    ))
    
    # Set the MVP-specific saved_item_id for the webhook
    # This overrides the default ID in the subreddit_selection module
    # Store the original value to restore later
    original_saved_item_id = os.environ.get("GUMLOOP_SAVED_ITEM_ID", "")
    os.environ["GUMLOOP_SAVED_ITEM_ID"] = "96YEbP1uWuEtBKNsiraxN7"
    
    # Use enhanced discovery if available, fallback to traditional
    if ENHANCED_AVAILABLE:
        console.print("[cyan]🤖 Using Enhanced AI Discovery...[/cyan]")
        
        # Initialize enhanced search agent
        agent = EnhancedSearchAgent(
            product_type=product_type,
            problem_area=problem_area,
            target_audience=target_audience,
            additional_context=question_goal
        )
        
        try:
            # Run enhanced discovery
            enhanced_results = await agent.discover_subreddits()
            
            # Display results in a nice format
            agent.display_results(enhanced_results)
            
            console.print(f"\n[bold green]✅ Enhanced discovery found {len(enhanced_results['validated_subreddits'])} validated subreddits![/bold green]")
            
            # Convert enhanced results to format expected by subreddit_selection
            validated_subreddits = []
            for sub in enhanced_results['validated_subreddits']:
                validated_subreddits.append({
                    'subreddit_name': sub['name'],
                    'subscribers': sub['subscribers'],
                    'description': sub['description'],
                    'is_active': sub['is_active'],
                    'over_18': sub['over_18']
                })
            
            # Run subreddit selection process
            if validated_subreddits:
                console.print("\n[cyan]📋 Proceeding to subreddit selection...[/cyan]")
                await select_subreddits_for_analysis(validated_subreddits)
            else:
                console.print("[yellow]⚠️ No subreddits found. Try adjusting your parameters.[/yellow]")
                
        except Exception as e:
            console.print(f"[red]❌ Enhanced discovery failed: {e}[/red]")
            console.print("[yellow]🔄 Falling back to traditional search...[/yellow]")
            
            # Fallback to traditional search agent
            agent = SearchAgent(
                product_type=product_type,
                problem_area=problem_area,
                target_audience=target_audience,
                additional_context=question_goal
            )
            result = await agent.run()
    else:
        console.print("[yellow]📊 Using Traditional Discovery Method...[/yellow]")
        
        # Initialize and run the traditional search agent
        agent = SearchAgent(
            product_type=product_type,
            problem_area=problem_area,
            target_audience=target_audience,
            additional_context=question_goal
        )
        
        result = await agent.run()
    
    # End of MVP flow - clean up environment
    try:
        pass  # Main logic completed above
    finally:
        # Restore the original environment variable if it existed
        if original_saved_item_id:
            os.environ["GUMLOOP_SAVED_ITEM_ID"] = original_saved_item_id
        else:
            os.environ.pop("GUMLOOP_SAVED_ITEM_ID", None)
    
    # End of flow
    console.print(Panel.fit(
        "[bold green]All done![/bold green]\n\n"
        "You've successfully discovered relevant subreddits that can help answer your question or achieve your goal."
    ))

if __name__ == "__main__":
    try:
        # Check for required environment variable
        if not os.getenv("OPENROUTER_API_KEY"):
            console.print("[bold red]Error: OPENROUTER_API_KEY is not set. This is required for AI functionality.[/bold red]")
            console.print("[yellow]Please set this in your .env file or environment and try again.[/yellow]")
            exit(1)
        
        # Run the main function
        asyncio.run(main())
    except KeyboardInterrupt:
        console.print("\n[bold yellow]Process interrupted by user. Exiting...[/bold yellow]")
    except Exception as e:
        console.print(f"\n[bold red]An error occurred: {str(e)}[/bold red]")
        import traceback
        console.print(traceback.format_exc()) 