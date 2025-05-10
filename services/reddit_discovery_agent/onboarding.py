#!/usr/bin/env python
"""
Reddit Discovery Agent Onboarding
---------------------------------
An interactive onboarding flow for the Reddit Discovery Agent.
This script will guide users through the process of:
1. Entering their product details
2. Running the subreddit search
3. Selecting subreddits
4. Sending analysis requests
"""

import os
import asyncio
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.markdown import Markdown

from search_agent import SearchAgent
from subreddit_selection import select_subreddits_for_analysis

console = Console()

async def main():
    # Welcome message
    console.print(Panel.fit(
        "[bold]Welcome to the VoiceScape![/bold]\n\n"
        "VoiceScape extracts authentic customer language from Reddit at scale, helping you"
        " validate products, features, and messaging before you build."
    ))
    
    console.print(Markdown("## Let's get started with a few questions about your product:"))
    
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
    
    additional_context = Prompt.ask(
        "[bold cyan]Any additional context about your product? (optional)[/bold cyan]",
        default=""
    )
    
    # Confirm inputs before proceeding
    console.print("\n[bold]Here's what we'll be searching for:[/bold]")
    console.print(f"Product Type: [cyan]{product_type}[/cyan]")
    console.print(f"Problem Area: [cyan]{problem_area}[/cyan]")
    console.print(f"Target Audience: [cyan]{target_audience}[/cyan]")
    
    if additional_context:
        console.print(f"Additional Context: [cyan]{additional_context}[/cyan]")
    
    proceed = Prompt.ask(
        "\nLook good?", 
        choices=["y", "n"], 
        default="y"
    )
    
    if proceed.lower() != "y":
        console.print("[yellow]Let's try again.[/yellow]")
        return await main()
    
    console.print(Panel.fit(
        "[bold]Starting subreddit discovery - this may take a few minutes![/bold]\n\n"
        "We'll search the web and analyze Reddit communities to find the best matches for your product."
    ))
    
    # Initialize and run the search agent
    agent = SearchAgent(
        product_type=product_type,
        problem_area=problem_area,
        target_audience=target_audience,
        additional_context=additional_context
    )
    
    result = await agent.run()
    
    # Ask if the user wants to select subreddits for analysis (this is handled in the agent.run())
    # The agent.run() method already calls select_subreddits_for_analysis() if the user chooses to
    
    # End of flow
    console.print(Panel.fit(
        "[bold green]All done![/bold green]\n\n"
        "You've successfully discovered relevant subreddits for your product."
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