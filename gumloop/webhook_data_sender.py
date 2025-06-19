def function(raw_xml_analysis, posts_data, run_id, subreddit_name):
    import requests
    import json
    from datetime import datetime
    
    # Initialize response tracking
    webhook_response = {}
    send_status = {
        "success": False,
        "timestamp": datetime.utcnow().isoformat(),
        "posts_sent": 0,
        "response_code": None
    }
    error_log = []
    
    try:
        # Prepare webhook payload
        webhook_payload = {
            "run_id": run_id,
            "subreddit": subreddit_name,
            "posts": [],
            "analysis_metadata": {
                "posts_processed": len(posts_data),
                "analysis_timestamp": datetime.utcnow().isoformat(),
                "model_used": "claude-3-sonnet",
                "subreddit": subreddit_name
            }
        }
        
        # Parse XML analysis and match to posts
        # For now, we'll send raw analysis with each post
        # The webhook endpoint will handle the XML parsing
        for post in posts_data:
            post_payload = {
                "post_id": post.get("post_id", ""),
                "subreddit": subreddit_name,
                "url": post.get("url", ""),
                "title": post.get("title", ""),
                "body": post.get("body", ""),
                "author": post.get("author", ""),
                "created_utc": post.get("created_utc", 0),
                "score": post.get("score", 0),
                "num_comments": post.get("num_comments", 0),
                "upvote_ratio": post.get("upvote_ratio", 0.0),
                "raw_analysis": raw_xml_analysis  # Full XML for server-side parsing
            }
            webhook_payload["posts"].append(post_payload)
        
        # Determine webhook URL from environment or use localhost for testing
        import os
        webhook_base_url = os.environ.get("WEBHOOK_BASE_URL", "http://localhost:3000")
        webhook_url = f"{webhook_base_url}/api/gumloop-raw"
        
        # Send data to webhook
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Gumloop-Webhook/1.0"
        }
        
        response = requests.post(
            webhook_url,
            json=webhook_payload,
            headers=headers,
            timeout=30
        )
        
        send_status["response_code"] = response.status_code
        send_status["posts_sent"] = len(posts_data)
        
        if response.status_code == 200:
            webhook_response = response.json()
            send_status["success"] = True
        else:
            error_log.append(f"Webhook returned status {response.status_code}: {response.text}")
            webhook_response = {"error": f"HTTP {response.status_code}", "message": response.text}
            
    except requests.exceptions.Timeout:
        error_log.append("Webhook request timed out after 30 seconds")
        webhook_response = {"error": "timeout", "message": "Request timed out"}
        
    except requests.exceptions.ConnectionError:
        error_log.append("Could not connect to webhook endpoint")
        webhook_response = {"error": "connection", "message": "Connection failed"}
        
    except Exception as e:
        error_log.append(f"Unexpected error sending webhook: {str(e)}")
        webhook_response = {"error": "exception", "message": str(e)}
    
    return webhook_response, send_status, error_log 