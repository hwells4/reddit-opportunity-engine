def function(run_id, status, progress_data):
    import requests
    import json
    from datetime import datetime
    
    # Initialize tracking variables
    update_response = {}
    current_status = status
    update_timestamp = datetime.utcnow().isoformat()
    
    try:
        # Prepare status update payload
        update_payload = {
            "run_id": run_id,
            "status": status,
            "updated_at": update_timestamp,
            "progress_data": progress_data
        }
        
        # Add additional status-specific data
        if isinstance(progress_data, dict):
            update_payload.update({
                "subreddits_processed": progress_data.get("subreddits_processed", 0),
                "total_subreddits": progress_data.get("total_subreddits", 0),
                "posts_analyzed": progress_data.get("posts_analyzed", 0),
                "quotes_extracted": progress_data.get("quotes_extracted", 0),
                "error_count": progress_data.get("error_count", 0),
                "processing_stage": progress_data.get("processing_stage", "unknown")
            })
        
        # Determine API endpoint
        import os
        api_base_url = os.environ.get("API_BASE_URL", "http://localhost:3000")
        update_url = f"{api_base_url}/api/runs/update"
        
        # Set request headers
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Gumloop-StatusUpdater/1.0"
        }
        
        # Send status update request
        response = requests.post(
            update_url,
            json=update_payload,
            headers=headers,
            timeout=15
        )
        
        if response.status_code == 200:
            update_response = response.json()
            current_status = update_response.get("status", status)
        elif response.status_code == 404:
            # Try alternative endpoint if primary doesn't exist
            alternative_url = f"{api_base_url}/api/check-status"
            alt_response = requests.post(alternative_url, json=update_payload, headers=headers, timeout=15)
            if alt_response.status_code == 200:
                update_response = alt_response.json()
                current_status = update_response.get("status", status)
            else:
                update_response = {
                    "error": f"Both endpoints failed: {response.status_code}, {alt_response.status_code}",
                    "status": status,
                    "timestamp": update_timestamp
                }
        else:
            update_response = {
                "error": f"HTTP {response.status_code}",
                "message": response.text,
                "status": status,
                "timestamp": update_timestamp
            }
            
    except requests.exceptions.Timeout:
        update_response = {
            "error": "timeout",
            "message": "Status update request timed out",
            "status": status,
            "timestamp": update_timestamp
        }
        
    except requests.exceptions.ConnectionError:
        update_response = {
            "error": "connection",
            "message": "Could not connect to status update endpoint",
            "status": status,
            "timestamp": update_timestamp
        }
        
    except Exception as e:
        update_response = {
            "error": "exception",
            "message": f"Unexpected error: {str(e)}",
            "status": status,
            "timestamp": update_timestamp
        }
    
    return update_response, current_status, update_timestamp 