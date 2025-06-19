def function(analyzed_posts_list, run_id, subreddit_name, webhook_base_url):
    import requests
    import json
    from datetime import datetime
    
    # Initialize processing status
    processing_status = {
        "success": False,
        "posts_processed": 0,
        "webhook_sent": False,
        "errors": [],
        "timestamp": datetime.utcnow().isoformat()
    }
    
    webhook_response = {}
    formatted_posts = []
    
    try:
        post_count = len(analyzed_posts_list)
        
        # Format the already-analyzed posts for process webhook
        for analyzed_post in analyzed_posts_list:
            # Extract the analysis response and post_id
            post_id = analyzed_post.get("post_id", "")
            analysis_response = analyzed_post.get("response", "")
            
            # Create post payload with the pre-existing analysis
            post_payload = {
                "post_id": post_id,
                "subreddit": subreddit_name,
                "url": analyzed_post.get("url", ""),
                "title": analyzed_post.get("title", ""),
                "body": analyzed_post.get("body", ""),
                "author": analyzed_post.get("author", ""),
                "created_utc": analyzed_post.get("created_utc", 0),
                "score": analyzed_post.get("score", 0),
                "num_comments": analyzed_post.get("num_comments", 0),
                "upvote_ratio": analyzed_post.get("upvote_ratio", 0.0),
                "raw_analysis": analysis_response  # This contains the XML analysis from previous Gumloop step
            }
            formatted_posts.append(post_payload)
        
        # Prepare webhook payload for process endpoint
        webhook_payload = {
            "run_id": run_id,
            "subreddit": subreddit_name,
            "posts": formatted_posts,
            "analysis_metadata": {
                "posts_processed": post_count,
                "analysis_timestamp": datetime.utcnow().isoformat(),
                "model_used": "gumloop_pipeline",
                "subreddit": subreddit_name,
                "processing_note": "Posts pre-analyzed in Gumloop pipeline"
            }
        }
        
        processing_status["posts_processed"] = post_count
        
        # Send data to process webhook endpoint
        webhook_url = f"{webhook_base_url}/api/process"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Gumloop-PostFormatter/1.0"
        }
        
        webhook_response_raw = requests.post(
            webhook_url,
            json=webhook_payload,
            headers=headers,
            timeout=60
        )
        
        if webhook_response_raw.status_code == 200:
            webhook_response = webhook_response_raw.json()
            processing_status["webhook_sent"] = True
            processing_status["success"] = True
        else:
            processing_status["errors"].append(f"Webhook failed: {webhook_response_raw.status_code} - {webhook_response_raw.text}")
            webhook_response = {"error": f"HTTP {webhook_response_raw.status_code}", "message": webhook_response_raw.text}
            
    except Exception as e:
        processing_status["errors"].append(f"Processing failed: {str(e)}")
        webhook_response = {"error": "processing_failed", "message": str(e)}
    
    return processing_status, webhook_response, post_count 