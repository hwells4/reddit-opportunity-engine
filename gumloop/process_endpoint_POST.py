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
        "timestamp": datetime.now().isoformat()
    }
    
    webhook_response = {}
    formatted_posts = []
    
    try:
        # Handle missing required parameters
        if not run_id:
            processing_status["errors"].append("Missing required parameter: run_id")
            run_id = f"auto_generated_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
        if not webhook_base_url:
            processing_status["errors"].append("Missing required parameter: webhook_base_url")
            
        # Parse the input data
        parsed_posts = []
        
        # If it's a list of strings, parse each string as JSON
        if isinstance(analyzed_posts_list, list) and len(analyzed_posts_list) > 0:
            for item in analyzed_posts_list:
                if isinstance(item, str):
                    try:
                        # Parse the string as JSON
                        post_data = json.loads(item)
                        parsed_posts.append(post_data)
                    except json.JSONDecodeError as e:
                        processing_status["errors"].append(f"Failed to parse JSON: {str(e)[:100]}")
                        continue
                elif isinstance(item, dict):
                    # Already a dictionary, just add it
                    parsed_posts.append(item)
                else:
                    processing_status["errors"].append(f"Unexpected item type: {type(item)}")
                    continue
                    
            analyzed_posts_list = parsed_posts
            
        # If it's a single string containing all the data
        elif isinstance(analyzed_posts_list, str):
            try:
                # Try to parse as a JSON array
                parsed_data = json.loads(analyzed_posts_list)
                if isinstance(parsed_data, list):
                    analyzed_posts_list = parsed_data
                else:
                    processing_status["errors"].append("String input parsed but not a list")
                    return processing_status, {"error": "invalid_input_format"}, 0
            except:
                # If that fails, try to extract individual JSON objects
                import re
                json_pattern = r'\{"response":.*?\}(?=\s*(?:Value|$))'
                matches = re.findall(json_pattern, analyzed_posts_list, re.DOTALL)
                
                for match in matches:
                    try:
                        post_data = json.loads(match)
                        parsed_posts.append(post_data)
                    except:
                        continue
                        
                analyzed_posts_list = parsed_posts
                
        else:
            processing_status["errors"].append(f"Invalid input type: expected list or string, got {type(analyzed_posts_list)}")
            return processing_status, {"error": "invalid_input_type"}, 0
        
        post_count = len(analyzed_posts_list)
        
        # Format the already-analyzed posts for process webhook
        for analyzed_post in analyzed_posts_list:
            try:
                # Extract the analysis response and post_id
                post_id_data = analyzed_post.get("post_id", "")
                analysis_response = analyzed_post.get("response", "")
                
                # Parse post_id if it's a JSON string
                if isinstance(post_id_data, str) and post_id_data.startswith("{"):
                    try:
                        post_id_json = json.loads(post_id_data)
                        post_id = post_id_json.get("id", "")
                        url = post_id_json.get("url", "")
                    except:
                        post_id = post_id_data
                        url = ""
                else:
                    post_id = post_id_data
                    url = analyzed_post.get("url", "")
                
                # Create post payload with the pre-existing analysis
                post_payload = {
                    "post_id": post_id,
                    "subreddit": subreddit_name,
                    "url": url,
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
                
            except Exception as e:
                processing_status["errors"].append(f"Failed to process post: {str(e)}")
                continue
        
        # Prepare webhook payload for process endpoint
        webhook_payload = {
            "run_id": run_id,
            "subreddit": subreddit_name,
            "posts": formatted_posts,
            "analysis_metadata": {
                "posts_processed": post_count,
                "analysis_timestamp": datetime.now().isoformat(),
                "model_used": "gumloop_pipeline",
                "subreddit": subreddit_name,
                "processing_note": "Posts pre-analyzed in Gumloop pipeline"
            }
        }
        
        processing_status["posts_processed"] = len(formatted_posts)
        
        # Only send webhook if we have a valid URL and posts to send
        if formatted_posts and webhook_base_url:
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
        else:
            if not formatted_posts:
                processing_status["errors"].append("No posts were successfully formatted")
            webhook_response = {"message": "No webhook sent due to missing URL or posts"}
            
    except Exception as e:
        processing_status["errors"].append(f"Processing failed: {str(e)}")
        webhook_response = {"error": "processing_failed", "message": str(e)}
    
    # Set final post_count variable
    post_count = len(formatted_posts)
    
    return processing_status, webhook_response, post_count