#!/usr/bin/env python3
"""
Gumloop Output Parser
--------------------
Converts the XML-like output from Gumloop into the JSON format expected by the webhook.
"""

import re
import json
import sys
from typing import List, Dict, Any

def extract_relevance_score(content: str) -> int:
    """Extract relevance score from <relevance_score> tag with fallback"""
    try:
        # Try primary pattern
        match = re.search(r'<relevance_score>(\d+)', content)
        if match:
            return int(match.group(1))
        
        # Fallback: look for just a number at start of line
        match = re.search(r'^(\d+)', content.strip())
        if match:
            return int(match.group(1))
        
        # Fallback: look for "score: X" pattern
        match = re.search(r'score:?\s*(\d+)', content, re.IGNORECASE)
        if match:
            return int(match.group(1))
            
        return 0
    except (ValueError, AttributeError):
        return 0

def extract_question_relevance_flag(content: str) -> bool:
    """Extract question relevance flag from <question_relevance_flag> tag"""
    match = re.search(r'<question_relevance_flag>(TRUE|FALSE)', content)
    return match.group(1) == 'TRUE' if match else False

def extract_content_classification(content: str) -> str:
    """Extract content classification from <content_classification> tag"""
    match = re.search(r'<content_classification>(.*?)</content_classification>', content, re.DOTALL)
    return match.group(1).strip() if match else ""

def extract_quotes_from_section(content: str, section_name: str) -> List[Dict[str, Any]]:
    """Extract quotes from a specific section like user_needs, user_language, etc."""
    quotes = []
    
    # Find the section
    section_pattern = f'<{section_name}>(.*?)</{section_name}>'
    section_match = re.search(section_pattern, content, re.DOTALL)
    
    if not section_match:
        return quotes
    
    section_content = section_match.group(1)
    
    # Extract quotes with their relevance flags
    quote_pattern = r'<quote is_question_relevant="(true|false)">(.*?)</quote>'
    quote_matches = re.findall(quote_pattern, section_content, re.DOTALL)
    
    for is_relevant, quote_text in quote_matches:
        # Extract post ID from quote text (e.g., "ApplyingToCollege-6ee69e:")
        post_id_match = re.search(r'^([A-Za-z]+-[A-Za-z0-9]+):', quote_text.strip())
        clean_text = quote_text.strip()
        
        if post_id_match:
            # Remove the post ID prefix from the quote text
            clean_text = quote_text.replace(post_id_match.group(0), '').strip()
            clean_text = clean_text.strip('"')  # Remove surrounding quotes
        
        quotes.append({
            'text': clean_text,
            'is_question_relevant': is_relevant == 'true'
        })
    
    return quotes

def extract_solutions_or_signals(content: str, section_name: str) -> List[Dict[str, Any]]:
    """Extract solutions or signals from sections like current_solutions, feature_signals"""
    items = []
    
    # Find the section
    section_pattern = f'<{section_name}>(.*?)</{section_name}>'
    section_match = re.search(section_pattern, content, re.DOTALL)
    
    if not section_match:
        return items
    
    section_content = section_match.group(1)
    
    # Extract items with their focus flags
    if section_name == 'current_solutions':
        item_pattern = r'<solution question_focus="(true|false)">(.*?)</solution>'
    elif section_name == 'feature_signals':
        item_pattern = r'<signal (?:is_)?question_(?:focus|relevant)="(true|false)">(.*?)</signal>'
    else:
        return items
    
    item_matches = re.findall(item_pattern, section_content, re.DOTALL)
    
    for is_focused, item_text in item_matches:
        items.append({
            'text': item_text.strip(),
            'question_focus': is_focused == 'true'
        })
    
    return items

def parse_gumloop_output(content: str, post_id: str, subreddit: str, url: str, title: str, body: str) -> Dict[str, Any]:
    """Parse a single Gumloop analysis output into our expected format"""
    
    return {
        'post_id': post_id,
        'subreddit': subreddit,
        'url': url,
        'title': title,
        'body': body,
        'relevance_score': extract_relevance_score(content),
        'question_relevance_flag': extract_question_relevance_flag(content),
        'content_classification': extract_content_classification(content),
        'user_needs_quotes': extract_quotes_from_section(content, 'user_needs'),
        'user_language_quotes': extract_quotes_from_section(content, 'user_language'),
        'current_solutions': extract_solutions_or_signals(content, 'current_solutions'),
        'feature_signals': extract_solutions_or_signals(content, 'feature_signals'),
        'audience_indicators': [],  # Can be added if needed
        'value_indicators': []      # Can be added if needed
    }

def parse_batch_output(batch_content: str, run_id: str) -> Dict[str, Any]:
    """Parse a batch of Gumloop outputs"""
    
    # This is a simplified version - you'll need to adapt based on how
    # Gumloop delivers the batch results to you
    
    posts = []
    
    # Split by posts (you'll need to adjust this based on your actual format)
    post_sections = batch_content.split('---POST_SEPARATOR---')  # Adjust separator
    
    for i, post_content in enumerate(post_sections):
        if not post_content.strip():
            continue
            
        # Extract basic post info (you'll need to adjust this)
        # This assumes the post info is at the top of each section
        post_id = f"reddit_post_{i}"  # Replace with actual extraction
        subreddit = "unknown"         # Replace with actual extraction
        url = f"https://reddit.com/post/{i}"  # Replace with actual extraction
        title = "Post Title"          # Replace with actual extraction
        body = "Post body content"    # Replace with actual extraction
        
        parsed_post = parse_gumloop_output(
            post_content, post_id, subreddit, url, title, body
        )
        posts.append(parsed_post)
    
    return {
        'run_id': run_id,
        'posts': posts
    }

if __name__ == "__main__":
    # Example usage
    sample_output = """
    <relevance_score>9 - Discusses mounting student debt, cost-of-attendance breakdown...</relevance_score>
    <question_relevance_flag>TRUE</question_relevance_flag>
    <user_needs>
    <quote is_question_relevant="true">ApplyingToCollege-6ee69e: "I wish someone had walked me through something like the Financial Order of Operations."</quote>
    <quote is_question_relevant="true">ApplyingToCollege-6ee69e: "Please don't mistake silence for affordability."</quote>
    </user_needs>
    <user_language>
    <quote is_question_relevant="true">"College costs are breaking us, and no one really prepared me for this part."</quote>
    </user_language>
    <current_solutions>
    <solution question_focus="true">Federal loans (Mohela services) – provides access to funding but high interest accrual over time.</solution>
    </current_solutions>
    <content_classification>HIGH_VALUE - Rich, first-hand account of cost breakdown...</content_classification>
    """
    
    parsed = parse_gumloop_output(
        sample_output, 
        "ApplyingToCollege-6ee69e", 
        "ApplyingToCollege", 
        "https://reddit.com/r/ApplyingToCollege/post/6ee69e",
        "College Cost Discussion",
        "Full post body here..."
    )
    
    print(json.dumps(parsed, indent=2)) 