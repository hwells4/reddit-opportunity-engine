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
            
            # Enhanced data extraction with better null handling
            def get_non_empty_value(key, default=None):
                """Get value from analyzed_post, but only if it's not empty/null"""
                value = analyzed_post.get(key, default)
                if value is None or (isinstance(value, str) and value.strip() == ""):
                    return default
                return value
            
            # Create post payload with enhanced data validation
            post_payload = {
                "post_id": post_id,
                "subreddit": subreddit_name,
                # Only include URL if it's not empty - let database preserve existing if needed
                "url": get_non_empty_value("url"),
                # Only include title if it's not empty - let database preserve existing if needed  
                "title": get_non_empty_value("title"),
                # Only include body if it's not empty - let database preserve existing if needed
                "body": get_non_empty_value("body"),
                # Comments handling - try to get meaningful comments data
                "comments": get_non_empty_value("comments") or get_non_empty_value("comment_content"),
                "author": get_non_empty_value("author"),
                "created_utc": analyzed_post.get("created_utc", 0),
                "score": analyzed_post.get("score", 0),
                "num_comments": analyzed_post.get("num_comments", 0),
                "upvote_ratio": analyzed_post.get("upvote_ratio", 0.0),
                "raw_analysis": analysis_response  # This contains the XML analysis from previous Gumloop step
            }
            
            # Log warning if critical fields are missing
            missing_fields = []
            if not post_payload["title"]:
                missing_fields.append("title")
            if not post_payload["body"]:
                missing_fields.append("body")
            if not post_payload["url"]:
                missing_fields.append("url")
                
            if missing_fields:
                print(f"⚠️ Post {post_id} missing fields: {', '.join(missing_fields)} - database will preserve existing data if available")
            
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