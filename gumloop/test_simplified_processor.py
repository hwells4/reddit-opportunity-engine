#!/usr/bin/env python3

# Import the function from our module
import sys
import os
sys.path.append(os.path.dirname(__file__))

# Import the function (simulate how Gumloop would import it)
exec(open('simplified_batch_processor.py').read())

# Test data with valid IDs
test_run_id = "d8f720c0-2efc-4305-b020-02caf2360dd3"
test_post_id = "7a7cb5ab-9b17-454d-8826-f25c5a2ec9d0"

# Mock analyzed posts data that would come from previous Gumloop step
analyzed_posts_list = [
    {
        "post_id": test_post_id,
        "response": """<post_analysis post_id="7a7cb5ab-9b17-454d-8826-f25c5a2ec9d0">
<relevance_score>8 - High relevance for testing webhook integration</relevance_score>
<question_relevance_flag>TRUE</question_relevance_flag>
<user_needs>
<quote is_question_relevant="true">I need a way to test my webhook endpoints properly</quote>
<quote is_question_relevant="true">Looking for reliable integration testing tools</quote>
</user_needs>
<user_language>
<quote is_question_relevant="true">This is frustrating when things don't work</quote>
</user_language>
<current_solutions>
<solution question_focus="true">Currently using manual testing but it's slow</solution>
</current_solutions>
<feature_signals>
<signal priority="high">Automated testing for webhook flows</signal>
</feature_signals>
</post_analysis>""",
        "url": "https://reddit.com/r/webdev/comments/test123",
        "title": "How to test webhook integrations properly?",
        "body": "I'm struggling with testing my webhook endpoints. Looking for advice on tools and approaches.",
        "author": "test_user",
        "created_utc": 1642680000,
        "score": 42,
        "num_comments": 15,
        "upvote_ratio": 0.85
    },
    {
        "post_id": "a1b2c3d4-5678-9abc-def0-123456789abc",
        "response": """<post_analysis post_id="test_post_2">
<relevance_score>6 - Moderate relevance for testing</relevance_score>
<question_relevance_flag>FALSE</question_relevance_flag>
<user_needs>
<quote is_question_relevant="false">Just sharing my experience</quote>
</user_needs>
<user_language>
<quote is_question_relevant="false">This worked well for me</quote>
</user_language>
<current_solutions>
<solution question_focus="false">Using existing solution successfully</solution>
</current_solutions>
<feature_signals>
<signal priority="low">No specific feature requests</signal>
</feature_signals>
</post_analysis>""",
        "url": "https://reddit.com/r/webdev/comments/test456",
        "title": "My webhook testing setup",
        "body": "Here's how I set up my webhook testing environment...",
        "author": "another_user", 
        "created_utc": 1642690000,
        "score": 23,
        "num_comments": 8,
        "upvote_ratio": 0.92
    }
]

def test_function():
    print("🧪 Testing simplified_batch_processor function...")
    print(f"📋 Test data: {len(analyzed_posts_list)} posts")
    print(f"🆔 Run ID: {test_run_id}")
    print(f"📍 Post ID: {test_post_id}")
    
    try:
        # Call the function
        processing_status, webhook_response, post_count = function(
            analyzed_posts_list=analyzed_posts_list,
            run_id=test_run_id,
            subreddit_name="webdev",
            webhook_base_url="http://localhost:3000"
        )
        
        print("\n✅ Function completed!")
        print(f"📊 Processing Status: {processing_status}")
        print(f"🔄 Webhook Response: {webhook_response}")
        print(f"📈 Post Count: {post_count}")
        
        # Check if it was successful
        if processing_status.get("success"):
            print("\n🎉 SUCCESS: Function worked correctly!")
            if webhook_response.get("success"):
                print("🎯 Webhook call succeeded!")
                print(f"📝 Posts processed: {webhook_response.get('posts_processed', 'unknown')}")
                print(f"💬 Quotes extracted: {webhook_response.get('quotes_extracted', 'unknown')}")
            else:
                print("⚠️  Webhook call had issues...")
        else:
            print("\n❌ FAILURE: Function had errors")
            print(f"🐛 Errors: {processing_status.get('errors', [])}")
            
    except Exception as e:
        print(f"\n💥 ERROR: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_function() 