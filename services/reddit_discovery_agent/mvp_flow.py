#!/usr/bin/env python
"""
Subtext MVP Flow
--------------
An interactive flow for the Subtext MVP mode, which focuses on finding subreddits
to answer a question or achieve a goal, rather than validating a product directly.
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
    
    console.print(Panel.fit(
        "[bold]Starting subreddit discovery - this may take a few minutes![/bold]\n\n"
        "We'll search Reddit communities to find the best ones to help answer your question or achieve your goal."
    ))
    
    # Set the MVP-specific saved_item_id for the webhook
    # This overrides the default ID in the subreddit_selection module
    # Store the original value to restore later
    original_saved_item_id = os.environ.get("GUMLOOP_SAVED_ITEM_ID", "")
    os.environ["GUMLOOP_SAVED_ITEM_ID"] = "96YEbP1uWuEtBKNsiraxN7"
    
    # Initialize and run the search agent with the question/goal as additional_context
    # This ensures compatibility with the existing search agent structure
    agent = SearchAgent(
        product_type=product_type,
        problem_area=problem_area,
        target_audience=target_audience,
        additional_context=question_goal
    )
    
    try:
        result = await agent.run()
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