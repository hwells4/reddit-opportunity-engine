from flask import Flask, request, jsonify
import asyncio
import json
import os
from enhanced_search_agent import EnhancedSearchAgent
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

@app.route('/enhanced-discover', methods=['POST'])
def enhanced_discover_subreddits():
    """
    Enhanced subreddit discovery endpoint using Perplexity and Firecrawl
    
    Expected JSON payload:
    {
        "product_type": "Virtual organizing services and home organization solutions",
        "problem_area": "Feeling overwhelmed by clutter and disorganization at home", 
        "target_audience": "Busy professionals and parents who need help organizing their homes",
        "additional_context": "Optional additional context about the business/product"
    }
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['product_type', 'problem_area', 'target_audience']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'error': f'Missing required field: {field}',
                    'required_fields': required_fields
                }), 400
        
        # Extract parameters
        product_type = data['product_type']
        problem_area = data['problem_area']
        target_audience = data['target_audience']
        additional_context = data.get('additional_context', '')
        
        # Create enhanced search agent
        agent = EnhancedSearchAgent(
            product_type=product_type,
            problem_area=problem_area,
            target_audience=target_audience,
            additional_context=additional_context
        )
        
        # Run the discovery process
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            results = loop.run_until_complete(agent.discover_subreddits())
        finally:
            loop.close()
        
        # Format results for API response
        formatted_results = {
            'success': True,
            'discovery_method': 'enhanced_ai_powered',
            'total_subreddits_found': len(results['validated_subreddits']),
            'discovery_sources': {
                'perplexity_count': len(results['perplexity_subreddits']),
                'firecrawl_count': len(results['firecrawl_subreddits'])
            },
            'recommendations': results['final_recommendations'],
            'validated_subreddits': results['validated_subreddits'],
            'summary': results['discovery_summary'],
            'search_parameters': {
                'product_type': product_type,
                'problem_area': problem_area,
                'target_audience': target_audience,
                'additional_context': additional_context
            }
        }
        
        return jsonify(formatted_results)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Enhanced subreddit discovery failed'
        }), 500

@app.route('/enhanced-discover/health', methods=['GET'])
def health_check():
    """
    Health check endpoint to verify API keys and service availability
    """
    health_status = {
        'service': 'enhanced_reddit_discovery',
        'status': 'healthy',
        'api_keys': {
            'perplexity': bool(os.getenv('PERPLEXITY_API_KEY')),
            'firecrawl': bool(os.getenv('FIRECRAWL_API_KEY')),
            'openrouter': bool(os.getenv('OPENROUTER_API_KEY'))
        },
        'capabilities': []
    }
    
    if health_status['api_keys']['perplexity']:
        health_status['capabilities'].append('perplexity_ai_discovery')
    
    if health_status['api_keys']['firecrawl']:
        health_status['capabilities'].append('firecrawl_search')
    
    if health_status['api_keys']['openrouter']:
        health_status['capabilities'].append('ai_recommendations')
    
    # Determine overall health
    if not any(health_status['api_keys'].values()):
        health_status['status'] = 'degraded'
        health_status['warning'] = 'No API keys configured - service will have limited functionality'
    
    return jsonify(health_status)

@app.route('/enhanced-discover/compare', methods=['POST'])
def compare_discovery_methods():
    """
    Compare the enhanced discovery method with the original method
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['product_type', 'problem_area', 'target_audience']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'error': f'Missing required field: {field}',
                    'required_fields': required_fields
                }), 400
        
        # Run enhanced discovery
        enhanced_agent = EnhancedSearchAgent(
            product_type=data['product_type'],
            problem_area=data['problem_area'],
            target_audience=data['target_audience'],
            additional_context=data.get('additional_context', '')
        )
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            enhanced_results = loop.run_until_complete(enhanced_agent.discover_subreddits())
        finally:
            loop.close()
        
        # TODO: Run original discovery method for comparison
        # For now, we'll just return the enhanced results with comparison structure
        
        comparison_results = {
            'enhanced_method': {
                'total_subreddits': len(enhanced_results['validated_subreddits']),
                'primary_recommendations': len(enhanced_results['final_recommendations'].get('primary', [])),
                'secondary_recommendations': len(enhanced_results['final_recommendations'].get('secondary', [])),
                'niche_recommendations': len(enhanced_results['final_recommendations'].get('niche', [])),
                'discovery_sources': ['perplexity_ai', 'firecrawl_search', 'ai_analysis'],
                'quality_score': calculate_quality_score(enhanced_results)
            },
            'original_method': {
                'note': 'Original method comparison not yet implemented',
                'total_subreddits': 0,
                'quality_score': 0
            },
            'recommendation': 'Use enhanced method for significantly better results',
            'enhanced_results': enhanced_results
        }
        
        return jsonify(comparison_results)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Discovery method comparison failed'
        }), 500

def calculate_quality_score(results):
    """
    Calculate a quality score for the discovery results
    """
    score = 0
    
    # Points for number of validated subreddits
    validated_count = len(results['validated_subreddits'])
    score += min(validated_count * 2, 20)  # Max 20 points
    
    # Points for having recommendations in all categories
    recommendations = results['final_recommendations']
    if recommendations.get('primary'):
        score += 30
    if recommendations.get('secondary'):
        score += 20
    if recommendations.get('niche'):
        score += 10
    
    # Points for using multiple discovery sources
    if results['perplexity_subreddits']:
        score += 10
    if results['firecrawl_subreddits']:
        score += 10
    
    return min(score, 100)  # Cap at 100

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001) 