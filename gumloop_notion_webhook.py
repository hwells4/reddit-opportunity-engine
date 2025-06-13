def function(meta, strategy):
    import requests
    import time
    import datetime
    import json
    
    NOTION_API_URL = "https://reddit-opportunity-engine-production.up.railway.app/api/add-to-notion"
    
    # Set default values since we don't have metadata
    email = 'harrison@dododigital.ai'
    run_id = f"gumloop-multi-community-{time.time()}"
    
    # Debug logging
    print(f"[GUMLOOP DEBUG] Starting webhook function")
    print(f"[GUMLOOP DEBUG] Meta report length: {len(meta) if meta else 0}")
    print(f"[GUMLOOP DEBUG] Strategy report length: {len(strategy) if strategy else 0}")
    print(f"[GUMLOOP DEBUG] Meta preview: {meta[:200] if meta else 'None'}...")
    print(f"[GUMLOOP DEBUG] Strategy preview: {strategy[:200] if strategy else 'None'}...")
    
    # Both meta and strategy are markdown reports
    # meta = comprehensive report (8-10 pages)
    # strategy = strategy report (3-4 pages)
    
    payload = {
        "comprehensiveReport": meta,  # The longer comprehensive report
        "strategyReport": strategy,   # The shorter strategy report
        "email": email,
        "runId": run_id,
        "clientType": "demo",
        "metadata": {
            "generatedAt": datetime.datetime.now().isoformat(),
            "analysisType": "multi-community",
            "source": "gumloop",
            "communities_analyzed": "multiple"
        }
    }
    
    print(f"[GUMLOOP DEBUG] Sending payload to: {NOTION_API_URL}")
    print(f"[GUMLOOP DEBUG] Payload keys: {list(payload.keys())}")
    
    try:
        response = requests.post(
            NOTION_API_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=120  # Increased timeout to 2 minutes for large reports
        )
        
        print(f"[GUMLOOP DEBUG] Response status code: {response.status_code}")
        print(f"[GUMLOOP DEBUG] Response headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            response_data = response.json()
            print(f"[GUMLOOP DEBUG] Success response data: {json.dumps(response_data, indent=2)}")
            success = {
                "success": True,
                "message": "Successfully saved both reports to Notion",
                "shareable_url": response_data.get("data", {}).get("shareableUrl"),
                "notion_page_id": response_data.get("data", {}).get("brandedHomepageId")
            }
        else:
            error_text = response.text[:1000]  # Show more error details
            print(f"[GUMLOOP DEBUG] Error response: {error_text}")
            success = {
                "success": False,
                "error": f"HTTP {response.status_code}: {error_text}"
            }
            
    except Exception as e:
        print(f"[GUMLOOP DEBUG] Exception occurred: {str(e)}")
        success = {
            "success": False,
            "error": f"Error: {str(e)}"
        }
    
    return success