def function(posts_data, analysis_prompt, run_id):
    import openai
    import json
    from datetime import datetime
    import os
    
    # Initialize analysis metadata
    analysis_metadata = {
        "timestamp": datetime.utcnow().isoformat(),
        "model_used": "claude-3-sonnet",
        "posts_analyzed": 0,
        "success": False,
        "errors": []
    }
    
    raw_xml_analysis = ""
    post_count = len(posts_data)
    
    try:
        # Configure OpenAI client for Claude via OpenRouter
        client = openai.OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ.get("OPENROUTER_API_KEY")
        )
        
        # Prepare posts content for analysis
        posts_content = ""
        for i, post in enumerate(posts_data):
            posts_content += f"""
POST_{i+1} (ID: {post['post_id']}):
Title: {post['title']}
Content: {post['body'][:2000]}  # Limit content length
Author: {post['author']}
Score: {post['score']}
Comments: {post['num_comments']}
URL: {post['url']}

---

"""
        
        # Create comprehensive analysis prompt
        system_prompt = f"""You are an expert Reddit analyst. Analyze the following Reddit posts for business opportunities, user needs, and market insights.

For EACH post, provide analysis in this EXACT XML format:

<post_analysis post_id="POST_ID_HERE">
<relevance_score>NUMBER - Explanation of relevance</relevance_score>
<question_relevance_flag>TRUE/FALSE</question_relevance_flag>
<user_needs>
<quote is_question_relevant="true/false">Exact quote showing user need</quote>
</user_needs>
<user_language>
<quote is_question_relevant="true/false">How users describe problems</quote>
</user_language>
<current_solutions>
<solution question_focus="true/false">Current solution mentioned</solution>
</current_solutions>
<feature_signals>
<signal priority="high/medium/low">Feature request or signal</signal>
</feature_signals>
</post_analysis>

Analysis Context: {analysis_prompt}
Run ID: {run_id}

Provide detailed analysis for ALL {post_count} posts."""

        user_prompt = f"""Analyze these {post_count} Reddit posts:

{posts_content}

Remember to provide <post_analysis> tags for EVERY post with their exact post_id."""
        
        # Make LLM API call
        response = client.chat.completions.create(
            model="anthropic/claude-3-5-sonnet",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=8000,
            temperature=0.1
        )
        
        raw_xml_analysis = response.choices[0].message.content
        analysis_metadata["posts_analyzed"] = post_count
        analysis_metadata["success"] = True
        
    except Exception as e:
        analysis_metadata["errors"].append(f"LLM analysis failed: {str(e)}")
        # Create fallback minimal XML for each post
        fallback_xml = ""
        for post in posts_data:
            fallback_xml += f"""
<post_analysis post_id="{post['post_id']}">
<relevance_score>5 - Analysis failed, manual review needed</relevance_score>
<question_relevance_flag>FALSE</question_relevance_flag>
<user_needs>
<quote is_question_relevant="false">Analysis failed for this post</quote>
</user_needs>
</post_analysis>
"""
        raw_xml_analysis = fallback_xml
    
    return raw_xml_analysis, post_count, analysis_metadata 