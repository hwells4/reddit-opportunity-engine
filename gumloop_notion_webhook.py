def function(meta, strategy):
    import requests
    import time
    import datetime
    
    NOTION_API_URL = "https://reddit-opportunity-engine-production.up.railway.app/api/add-to-notion"
    
    # Set default values since we don't have metadata
    email = 'harrison@dododigital.ai'
    run_id = f"gumloop-multi-community-{time.time()}"
    
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
    
    try:
        response = requests.post(
            NOTION_API_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=120  # Increased timeout to 2 minutes for large reports
        )
        
        if response.status_code == 200:
            response_data = response.json()
            success = {
                "success": True,
                "message": "Successfully saved both reports to Notion",
                "shareable_url": response_data.get("data", {}).get("shareableUrl"),
                "notion_page_id": response_data.get("data", {}).get("brandedHomepageId")
            }
        else:
            success = {
                "success": False,
                "error": f"HTTP {response.status_code}: {response.text[:500]}"
            }
            
    except Exception as e:
        success = {
            "success": False,
            "error": f"Error: {str(e)}"
        }
    
    return success 