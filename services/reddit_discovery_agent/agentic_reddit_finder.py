#!/usr/bin/env python

import argparse
import time
import uuid
import json
import asyncio
from rich.console import Console
from search_agent import SearchAgent
from recommendation_agent import RecommendationAgent, main as recommendation_main
from subreddit_utils import clear_cache

# Setup console for better output
console = Console()

async def run_agentic_finder_async(product_type, problem_area, target_audience, additional_context=None):
    """
    Run the full agentic Reddit discovery process asynchronously.
    
    Args:
        product_type (str): Type of product
        problem_area (str): Problem area the product addresses
        target_audience (str): Target audience for the product
        additional_context (str): Any additional context
    
    Returns:
        dict: Final recommendations
    """
    run_id = str(uuid.uuid4())[:8]
    console.print(f"\n[bold green]===== STARTING AGENTIC REDDIT FINDER (ID: {run_id}) =====[/bold green]")
    
    start_time = time.time()
    
    # Step 1: Run the search agent to find subreddits
    console.print("[bold cyan]PHASE 1: DISCOVERING SUBREDDITS[/bold cyan]")
    search_agent = SearchAgent(
        product_type=product_type,
        problem_area=problem_area,
        target_audience=target_audience,
        additional_context=additional_context
    )
    
    validated_subreddits = await search_agent.run()
    
    # Step 2: Generate recommendations from the discovered subreddits
    console.print("[bold cyan]PHASE 2: GENERATING RECOMMENDATIONS[/bold cyan]")
    recommendations = recommendation_main(
        validated_subreddits=validated_subreddits,
        product_type=product_type,
        problem_area=problem_area,
        target_audience=target_audience,
        additional_context=additional_context
    )
    
    # Add metadata about the search process
    if recommendations:
        recommendations["metadata"] = {
            "run_id": run_id,
            "search_iterations": search_agent.search_iterations,
            "total_subreddits_found": len(search_agent.found_subreddits),
            "validated_subreddits_count": len(validated_subreddits),
            "execution_time_seconds": round(time.time() - start_time, 2),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
    
    console.print(f"\n[bold green]===== COMPLETED AGENTIC REDDIT FINDER (ID: {run_id}) =====[/bold green]")
    console.print(f"Total execution time: {round(time.time() - start_time, 2)} seconds")
    
    # Clear any remaining caches
    clear_cache()
    
    # Display final recommendations
    if recommendations and "subreddit_recommendations" in recommendations:
        console.print("\n[bold green]FINAL RECOMMENDATIONS:[/bold green]")
        for i, rec in enumerate(recommendations["subreddit_recommendations"]):
            console.print(f"  [bold]{i+1}.[/bold] {rec['subreddit_name']} ({rec.get('subscriber_count', 'Unknown')} subscribers)")
    
    return recommendations

def run_agentic_finder(product_type, problem_area, target_audience, additional_context=None):
    """
    Run the full agentic Reddit discovery process.
    
    Args:
        product_type (str): Type of product
        problem_area (str): Problem area the product addresses
        target_audience (str): Target audience for the product
        additional_context (str): Any additional context
    
    Returns:
        dict: Final recommendations
    """
    return asyncio.run(run_agentic_finder_async(
        product_type=product_type,
        problem_area=problem_area,
        target_audience=target_audience,
        additional_context=additional_context
    ))

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='Find relevant subreddits based on product, problem area, and target audience using an agentic approach.')
    parser.add_argument('--product-type', type=str, required=True, help='Type of product (e.g., "SaaS for indie developers")')
    parser.add_argument('--problem-area', type=str, required=True, help='Problem area the product addresses')
    parser.add_argument('--target-audience', type=str, required=True, help='Target audience for the product')
    parser.add_argument('--additional-context', type=str, help='Any additional context about what you\'re looking for')
    parser.add_argument('--output-file', type=str, help='Optional: Save results to a JSON file')
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_arguments()
    
    recommendations = run_agentic_finder(
        product_type=args.product_type,
        problem_area=args.problem_area,
        target_audience=args.target_audience,
        additional_context=args.additional_context
    )
    
    # Save results to a file if requested
    if args.output_file and recommendations:
        with open(args.output_file, 'w') as f:
            json.dump(recommendations, f, indent=2)
        console.print(f"\n[bold]Results saved to {args.output_file}[/bold]") 