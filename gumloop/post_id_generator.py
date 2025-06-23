def function(urls, subreddit):
    import uuid
    id_list = []
    for url in urls:
        # Generate proper UUID for Supabase database compatibility
        unique_id = str(uuid.uuid4())
        id_list.append({"id": unique_id, "url": url})

    return id_list