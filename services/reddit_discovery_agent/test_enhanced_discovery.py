#!/usr/bin/env python3
"""
Test script to demonstrate the enhanced subreddit discovery system
"""

import asyncio
import json
from enhanced_search_agent import EnhancedSearchAgent
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

async def test_virtual_organizing_business():
    """
    Test the enhanced discovery for the virtual organizing business
    """
    console.print(Panel.fit(
        "🧪 Testing Enhanced Subreddit Discovery\n"
        "Business: Virtual Organizing Services",
        title="Test Case 1"
    ))
    
    # Create the enhanced search agent
    agent = EnhancedSearchAgent(
        product_type="Virtual organizing services and home organization solutions",
        problem_area="Feeling overwhelmed by clutter and disorganization at home",
        target_audience="Busy professionals and parents who need help organizing their homes",
        additional_context="Offers virtual consultations, organizing courses, and subscription services for ongoing support. Price ranges from $24.99 for courses to $850 for comprehensive packages."
    )
    
    # Run the discovery
    results = await agent.discover_subreddits()
    
    # Display results
    agent.display_results(results)
    
    return results

async def test_saas_business():
    """
    Test the enhanced discovery for a SaaS business
    """
    console.print(Panel.fit(
        "🧪 Testing Enhanced Subreddit Discovery\n"
        "Business: Project Management SaaS",
        title="Test Case 2"
    ))
    
    # Create the enhanced search agent
    agent = EnhancedSearchAgent(
        product_type="Project management and team collaboration software",
        problem_area="Teams struggling with project coordination and communication",
        target_audience="Small to medium business owners and project managers",
        additional_context="Cloud-based solution with integrations, real-time collaboration, and reporting features"
    )
    
    # Run the discovery
    results = await agent.discover_subreddits()
    
    # Display results
    agent.display_results(results)
    
    return results

async def compare_with_original_results():
    """
    Compare enhanced results with what the original system might have found
    """
    console.print(Panel.fit(
        "📊 Comparison: Enhanced vs Original Discovery",
        title="Quality Comparison"
    ))
    
    # Simulate original system results (poor quality)
    original_results = [
        "organizing",
        "declutter", 
        "minimalism",
        "productivity"
    ]
    
    # Run enhanced discovery
    agent = EnhancedSearchAgent(
        product_type="Virtual organizing services",
        problem_area="Home clutter and disorganization",
        target_audience="Busy professionals and parents"
    )
    
    enhanced_results = await agent.discover_subreddits()
    
    # Create comparison table
    table = Table(title="Discovery Method Comparison")
    table.add_column("Metric", style="cyan")
    table.add_column("Original System", style="red")
    table.add_column("Enhanced System", style="green")
    
    table.add_row(
        "Discovery Method",
        "Basic keyword search",
        "AI-powered multi-source"
    )
    table.add_row(
        "Number of Sources",
        "1 (basic search)",
        "2+ (Perplexity + Firecrawl)"
    )
    table.add_row(
        "Subreddits Found",
        str(len(original_results)),
        str(len(enhanced_results['validated_subreddits']))
    )
    table.add_row(
        "Quality Validation",
        "None",
        "Full validation + metadata"
    )
    table.add_row(
        "Categorization",
        "None",
        "Primary/Secondary/Niche"
    )
    table.add_row(
        "Relevance Scoring",
        "None",
        "AI-powered 1-10 scale"
    )
    table.add_row(
        "Engagement Strategy",
        "None",
        "Specific recommendations"
    )
    
    console.print(table)
    
    # Show specific examples
    console.print("\n[red]Original Results (Poor Quality):[/red]")
    for sub in original_results:
        console.print(f"  • r/{sub} - No context or validation")
    
    console.print("\n[green]Enhanced Results (High Quality):[/green]")
    primary_recs = enhanced_results['final_recommendations'].get('primary', [])
    for rec in primary_recs[:3]:  # Show top 3
        console.print(f"  • r/{rec['name']} - Score: {rec['relevance_score']}/10")
        console.print(f"    Reason: {rec['relevance_reason'][:80]}...")
        console.print(f"    Strategy: {rec['engagement_approach'][:80]}...")
        console.print()

async def main():
    """
    Run all test cases
    """
    console.print("[bold blue]🚀 Enhanced Subreddit Discovery Test Suite[/bold blue]\n")
    
    # Test 1: Virtual organizing business
    organizing_results = await test_virtual_organizing_business()
    
    console.print("\n" + "="*80 + "\n")
    
    # Test 2: SaaS business
    saas_results = await test_saas_business()
    
    console.print("\n" + "="*80 + "\n")
    
    # Comparison with original
    await compare_with_original_results()
    
    # Summary
    console.print(Panel.fit(
        "✅ Enhanced Discovery System Benefits:\n\n"
        "• Uses Perplexity AI for intelligent subreddit discovery\n"
        "• Leverages Firecrawl for comprehensive Reddit search\n"
        "• Validates all subreddits with real metadata\n"
        "• Provides AI-powered relevance scoring\n"
        "• Categorizes communities by relevance level\n"
        "• Offers specific engagement strategies\n"
        "• Eliminates false positives and dead communities\n"
        "• Discovers niche communities missed by basic search",
        title="🎯 System Advantages"
    ))

if __name__ == "__main__":
    asyncio.run(main()) 