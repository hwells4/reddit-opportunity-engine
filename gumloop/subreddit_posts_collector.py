def function(subreddit_name, post_limit, run_id):
    import requests
    import json
    import time
    from datetime import datetime
    
    # Initialize collection status
    collection_status = {
        "success": False,
        "posts_collected": 0,
        "errors": [],
        "timestamp": datetime.utcnow().isoformat()
    }
    
    posts_data = []
    subreddit_info = {}
    
    try:
        # Get subreddit information first
        subreddit_url = f"https://www.reddit.com/r/{subreddit_name}/about.json"
        headers = {
            'User-Agent': 'RedditOpportunityEngine/1.0'
        }
        
        # Fetch subreddit info
        response = requests.get(subreddit_url, headers=headers)
        if response.status_code == 200:
            subreddit_data = response.json()
            subreddit_info = {
                "name": subreddit_name,
                "subscribers": subreddit_data.get("data", {}).get("subscribers", 0),
                "description": subreddit_data.get("data", {}).get("public_description", ""),
                "over_18": subreddit_data.get("data", {}).get("over18", False),
                "active": True
            }
        else:
            subreddit_info = {
                "name": subreddit_name,
                "subscribers": 0,
                "description": "",
                "over_18": False,
                "active": False
            }
            collection_status["errors"].append(f"Could not fetch subreddit info: {response.status_code}")
        
        # Fetch posts from subreddit
        posts_url = f"https://www.reddit.com/r/{subreddit_name}/hot.json?limit={post_limit}"
        time.sleep(1)  # Rate limiting
        
        posts_response = requests.get(posts_url, headers=headers)
        if posts_response.status_code == 200:
            posts_json = posts_response.json()
            posts_list = posts_json.get("data", {}).get("children", [])
            
            for post in posts_list:
                post_data = post.get("data", {})
                
                # Extract relevant post information
                post_info = {
                    "post_id": post_data.get("id", ""),
                    "subreddit": subreddit_name,
                    "url": f"https://reddit.com{post_data.get('permalink', '')}",
                    "title": post_data.get("title", ""),
                    "body": post_data.get("selftext", ""),
                    "author": post_data.get("author", ""),
                    "created_utc": post_data.get("created_utc", 0),
                    "score": post_data.get("score", 0),
                    "num_comments": post_data.get("num_comments", 0),
                    "upvote_ratio": post_data.get("upvote_ratio", 0.0),
                    "run_id": run_id
                }
                
                # Only include posts with meaningful content
                if post_info["title"] and (post_info["body"] or post_info["num_comments"] > 0):
                    posts_data.append(post_info)
            
            collection_status["posts_collected"] = len(posts_data)
            collection_status["success"] = True
            
        else:
            collection_status["errors"].append(f"Could not fetch posts: {posts_response.status_code}")
            
    except Exception as e:
        collection_status["errors"].append(f"Exception during collection: {str(e)}")
    
    return posts_data, subreddit_info, collection_status 