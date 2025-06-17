#!/usr/bin/env python3
"""
Quick test script for the Enhanced Search Agent
"""
import asyncio
import sys
from enhanced_search_agent import EnhancedSearchAgent

async def test_enhanced_agent():
    """Quick test of the enhanced search agent with a simple example"""
    print("🧪 Testing Enhanced Search Agent...")
    
    # Simple test case
    agent = EnhancedSearchAgent(
        product_type="AI automation tools",
        problem_area="struggling with implementing AI tools effectively",
        target_audience="small business owners and entrepreneurs",
        additional_context="Focus on practical implementation over complex features"
    )
    
    try:
        print("🚀 Starting discovery process...")
        results = await agent.discover_subreddits()
        
        print(f"\n✅ Discovery completed successfully!")
        print(f"📊 Results summary:")
        print(f"   - Perplexity subreddits: {len(results.get('perplexity_subreddits', []))}")
        print(f"   - Firecrawl subreddits: {len(results.get('firecrawl_subreddits', []))}")
        print(f"   - Validated subreddits: {len(results.get('validated_subreddits', []))}")
        
        # Show a few validated subreddits
        validated = results.get('validated_subreddits', [])
        if validated:
            print(f"\n📋 Sample validated subreddits:")
            for sub in validated[:5]:  # Show first 5
                print(f"   - r/{sub['name']} ({sub['subscribers']} subscribers)")
        
        # Show final recommendations
        final_recs = results.get('final_recommendations', {})
        if isinstance(final_recs, dict):
            primary = final_recs.get('primary', [])
            if primary:
                print(f"\n🎯 Top primary recommendations:")
                for rec in primary[:3]:  # Show top 3
                    print(f"   - r/{rec['name']} (score: {rec['relevance_score']})")
        
        return True
        
    except KeyboardInterrupt:
        print("\n⚠️ Test interrupted by user")
        return False
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        return False

if __name__ == "__main__":
    try:
        success = asyncio.run(test_enhanced_agent())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n👋 Test cancelled by user")
        sys.exit(1) 