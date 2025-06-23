def function(report_text, quotes_data, user_question, context_summary):
    """
    Process report text to find quotes and create hyperlinked version using fuzzy matching
    against provided quotes data. Uses intelligent text matching to link quotes to Reddit URLs.
    
    Parameters:
    - report_text: The content of the report with quotes to be matched
    - quotes_data: JSON array of quotes with post data from Supabase query
    - user_question: User's original question (for context)
    - context_summary: Additional context information
    
    Returns:
    - processed_markdown: Updated markdown with hyperlinks and TOC
    - stats: Dictionary with processing statistics as a string
    - html_version: Basic HTML version of the report with hyperlinks and TOC
    """
    import re
    import json
    from difflib import SequenceMatcher
    import random

    # --- ENCODING FIX: Clean up corrupted characters first ---
    def fix_encoding_issues(text):
        """Fix common encoding corruption issues without touching formatting"""
        if not text:
            return text
            
        # Comprehensive corruption patterns - order matters for some
        replacements = {
            # Apostrophe corruptions (most common issue)
            'â€TMt': "'t",    # didn't, can't, etc.
            'â€TMm': "'m",    # I'm
            'â€TMs': "'s",    # it's, that's, etc.
            'â€TMve': "'ve",  # I've, we've, etc.
            'â€TMre': "'re",  # you're, they're, etc.
            'â€TMll': "'ll",  # I'll, we'll, etc.
            'â€TMd': "'d",    # I'd, he'd, etc.
            'â€TM': "'",      # standalone apostrophe
            
            # Quote marks
            'â€œ': '"',       # left double quote
            'â€': '"',        # right double quote
            'â€™': "'",       # right single quote
            'â€˜': "'",       # left single quote
            'â€ ̃': '"',      # another quote variant
            
            # Dashes and punctuation
            'â€"': '—',       # em dash
            'â€¦': '…',       # ellipsis
            'â€¢': '•',       # bullet point
            
            # Math and special symbols
            'â‰ˆ': '≈',       # approximately equal
            'Ã—': '×',        # multiplication sign
            
            # Spacing issues
            'Â ': ' ',        # corrupted non-breaking space
            'Â': '',          # standalone corrupted character
        }
        
        # Apply fixes in order
        for corrupted, fixed in replacements.items():
            text = text.replace(corrupted, fixed)
            
        return text

    # Apply encoding fix to all inputs immediately
    report_text = fix_encoding_issues(str(report_text)) if report_text else ""
    user_question = fix_encoding_issues(str(user_question)) if user_question else ""
    
    if isinstance(context_summary, str):
        context_summary = fix_encoding_issues(context_summary)
    elif isinstance(context_summary, dict):
        context_summary = {k: fix_encoding_issues(str(v)) if v else v for k, v in context_summary.items()}

    # --- 1. Parse quotes data ---
    try:
        if isinstance(quotes_data, str):
            quotes_list = json.loads(quotes_data)
        else:
            quotes_list = quotes_data
            
        if not quotes_list:
            return report_text, json.dumps({"error": "No quotes data provided"}), f"<html><body><pre>{report_text}</pre></body></html>"
            
    except Exception as e:
        return report_text, json.dumps({"error": f"Failed to parse quotes data: {str(e)}"}), f"<html><body><pre>{report_text}</pre></body></html>"

    # --- 2. Fuzzy Text Matching Functions ---
    def similarity_ratio(a, b):
        """Calculate similarity ratio between two strings"""
        return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()

    def clean_quote_for_matching(quote):
        """Clean quote text for better matching"""
        # Remove common quote markers and extra whitespace
        cleaned = re.sub(r'^["\'""]|["\'""]$', '', quote.strip())
        cleaned = re.sub(r'\s+', ' ', cleaned)
        return cleaned.strip()

    def extract_quotes_from_report(text):
        """Extract potential quotes from the report text"""
        quotes = []
        
        # Pattern 1: Text in quotes (various quote marks)
        quote_patterns = [
            r'"([^"]{20,500})"',  # Double quotes
            r'[""']([^""']{20,500})[""']',  # Smart quotes
            r"'([^']{20,500})'",  # Single quotes (longer text only)
        ]
        
        for pattern in quote_patterns:
            matches = re.finditer(pattern, text, re.DOTALL)
            for match in matches:
                quote_text = clean_quote_for_matching(match.group(1))
                if len(quote_text) >= 20:  # Minimum length filter
                    quotes.append({
                        'text': quote_text,
                        'original_match': match.group(0),
                        'start_pos': match.start(),
                        'end_pos': match.end()
                    })
        
        # Pattern 2: Sentences that might be quotes (heuristic approach)
        # Look for sentences with certain indicators
        sentence_patterns = [
            r'[A-Z][^.!?]{30,400}[.!?]',  # Complete sentences of reasonable length
        ]
        
        for pattern in sentence_patterns:
            matches = re.finditer(pattern, text)
            for match in matches:
                sentence = clean_quote_for_matching(match.group(0))
                # Only include if it contains personal pronouns or emotion words (likely user language)
                if re.search(r'\b(I|me|my|we|our|us|frustrated|love|hate|need|want|wish|hope)\b', sentence, re.IGNORECASE):
                    quotes.append({
                        'text': sentence,
                        'original_match': match.group(0),
                        'start_pos': match.start(),
                        'end_pos': match.end()
                    })
        
        # Remove duplicates and sort by position
        unique_quotes = []
        seen_texts = set()
        for quote in sorted(quotes, key=lambda x: x['start_pos']):
            if quote['text'] not in seen_texts:
                unique_quotes.append(quote)
                seen_texts.add(quote['text'])
        
        return unique_quotes

    def find_best_matches(report_quotes, db_quotes, similarity_threshold=0.95):
        """Find best matches between report quotes and database quotes"""
        matches = []
        used_db_quotes = set()
        
        for report_quote in report_quotes:
            candidates = []
            
            # Find all potential matches above threshold
            for db_quote in db_quotes:
                if db_quote.get('quote_id') in used_db_quotes:
                    continue
                    
                db_text = clean_quote_for_matching(db_quote.get('text', ''))
                similarity = similarity_ratio(report_quote['text'], db_text)
                
                if similarity >= similarity_threshold:
                    candidates.append({
                        'db_quote': db_quote,
                        'similarity': similarity
                    })
            
            if candidates:
                # Sort by similarity and handle ties
                candidates.sort(key=lambda x: x['similarity'], reverse=True)
                
                # If there are multiple candidates with very similar scores (within 0.02), randomly pick one
                top_similarity = candidates[0]['similarity']
                top_candidates = [c for c in candidates if c['similarity'] >= top_similarity - 0.02]
                
                if len(top_candidates) > 1:
                    # Random selection for ties
                    chosen_candidate = random.choice(top_candidates)
                else:
                    chosen_candidate = candidates[0]
                
                matches.append({
                    'report_quote': report_quote,
                    'db_quote': chosen_candidate['db_quote'],
                    'similarity': chosen_candidate['similarity']
                })
                
                used_db_quotes.add(chosen_candidate['db_quote'].get('quote_id'))
        
        return matches

    # --- 3. Extract quotes from report and find matches ---
    report_quotes = extract_quotes_from_report(report_text)
    
    # Organize database quotes by subreddit for better matching
    db_quotes_by_subreddit = {}
    for quote in quotes_list:
        subreddit = quote.get('subreddit', 'unknown')
            
        if subreddit not in db_quotes_by_subreddit:
            db_quotes_by_subreddit[subreddit] = []
        db_quotes_by_subreddit[subreddit].append(quote)
    
    # Find matches with high similarity threshold
    all_matches = []
    
    # First pass: try to match within subreddits (more precise)
    for subreddit, subreddit_quotes in db_quotes_by_subreddit.items():
        subreddit_matches = find_best_matches(report_quotes, subreddit_quotes, similarity_threshold=0.98)
        all_matches.extend(subreddit_matches)
    
    # Second pass: match remaining quotes across all subreddits with slightly lower threshold
    matched_report_quotes = {m['report_quote']['text'] for m in all_matches}
    remaining_report_quotes = [q for q in report_quotes if q['text'] not in matched_report_quotes]
    
    if remaining_report_quotes:
        remaining_matches = find_best_matches(remaining_report_quotes, quotes_list, similarity_threshold=0.95)
        all_matches.extend(remaining_matches)

    # --- 4. Replace quotes with links in the report ---
    processed_text = report_text
    linked_count = 0
    
    # Sort matches by position (reverse order to avoid position shifts)
    all_matches.sort(key=lambda x: x['report_quote']['start_pos'], reverse=True)
    
    for match in all_matches:
        report_quote = match['report_quote']
        db_quote = match['db_quote']
        
        # Extract Reddit URL directly from quote data
        reddit_url = db_quote.get('url', '#')
            
        quote_text = report_quote['original_match']
        linked_quote = f'[{quote_text}]({reddit_url})'
        
        # Replace in text
        start_pos = report_quote['start_pos']
        end_pos = report_quote['end_pos']
        
        processed_text = processed_text[:start_pos] + linked_quote + processed_text[end_pos:]
        linked_count += 1

    # --- 5. Prepare Context String ---
    context_display_string = ""
    if isinstance(context_summary, dict):
        for key, value in context_summary.items():
            if value and str(value).strip():
                context_display_string += f"- **{key.replace('_', ' ').title()}**: {value}\n"
        if context_display_string:
             context_display_string = "### Input Context:\n" + context_display_string
    elif isinstance(context_summary, str) and context_summary.strip():
        context_display_string = f"### Input Context:\n{context_summary}\n"

    # --- 6. Generate Table of Contents and Document Structure ---
    doc_title = "Research Report"
    executive_summary_md = ""
    body_after_summary_and_title = processed_text

    # Try to find H1 title
    title_match = re.search(r'^\s*#\s+(.+?)\s*(\n|$)', processed_text, re.MULTILINE)
    if title_match:
        doc_title = title_match.group(1).strip()
        body_after_summary_and_title = processed_text[title_match.end():]

    # Look for "Executive Summary"
    summary_headings_pattern = r'^\s*##\s+(Executive Summary(?: & Direct Answer)?|Key Takeaways|Overall Findings|Report Summary)\s*(\n|$)'
    summary_match = re.search(summary_headings_pattern, body_after_summary_and_title, re.MULTILINE | re.IGNORECASE)

    if summary_match:
        summary_content_start_index = summary_match.end()
        next_h2_match = re.search(r'^\s*##\s+', body_after_summary_and_title[summary_content_start_index:], re.MULTILINE)
        
        if next_h2_match:
            summary_content_end_index = summary_content_start_index + next_h2_match.start()
            executive_summary_md = body_after_summary_and_title[summary_match.start():summary_content_end_index].strip()
            body_after_summary_and_title = body_after_summary_and_title[:summary_match.start()] + body_after_summary_and_title[summary_content_end_index:]
        else:
            executive_summary_md = body_after_summary_and_title[summary_match.start():].strip()
            body_after_summary_and_title = body_after_summary_and_title[:summary_match.start()]

    # Generate TOC
    heading_pattern_toc = re.compile(r'^\s*(#{2,3})\s+(.+?)\s*(\n|$)', re.MULTILINE) 
    headings_for_toc = heading_pattern_toc.findall(body_after_summary_and_title)

    toc_entries = []
    section_counters = [0, 0]
    max_toc_entries = 20

    for h_level_md, h_text, _ in headings_for_toc:
        if len(toc_entries) >= max_toc_entries:
            break

        level_idx = len(h_level_md) - 2

        if level_idx == 0:
            section_counters[0] += 1
            section_counters[1] = 0
            section_num_str = f"{section_counters[0]}."
        elif level_idx == 1:
            section_counters[1] += 1
            section_num_str = f"{section_counters[0]}.{section_counters[1]}"
        else:
            continue

        slug = re.sub(r'[^\w\s-]', '', h_text.lower().strip())
        slug = re.sub(r'[-\s]+', '-', slug).strip('-')
        slug = slug[:50]
        if not slug: slug = f"section-{len(toc_entries)}"
        
        original_slug = slug
        counter = 1
        while any(entry['slug'] == slug for entry in toc_entries):
            slug = f"{original_slug}-{counter}"
            counter += 1

        toc_entries.append({
            'level': level_idx,
            'text': h_text.strip(),
            'number': section_num_str,
            'slug': slug
        })

    toc_md_list = ["## Table of Contents", ""]
    for entry in toc_entries:
        indent = "  " * entry['level']
        toc_md_list.append(f"{indent}- {entry['number']} [{entry['text']}](#{entry['slug']})")
    
    toc_md_content = "\n".join(toc_md_list)

    # Add section numbers to headings
    numbered_markdown_body = body_after_summary_and_title
    
    def add_section_numbers_md(match):
        h_level_md = match.group(1)
        h_text_original = match.group(2).strip()
        
        level_idx = len(h_level_md) - 2
        toc_entry = next((e for e in toc_entries if e['text'] == h_text_original and e['level'] == level_idx), None)
        
        if toc_entry:
            return f"{h_level_md} {toc_entry['number']} {h_text_original}\n"
        return match.group(0)

    numbered_markdown_body = heading_pattern_toc.sub(add_section_numbers_md, numbered_markdown_body)

    # Assemble final document
    final_markdown_parts = [f"# {doc_title}\n\n"]

    if user_question and user_question.strip():
        final_markdown_parts.append(f"## User's Question:\n> {user_question.strip()}\n\n")
    
    if context_display_string:
        final_markdown_parts.append(context_display_string + "\n")

    if executive_summary_md:
        final_markdown_parts.append(executive_summary_md + "\n\n---\n")

    if toc_entries:
        final_markdown_parts.append(toc_md_content + "\n\n---\n")
    
    final_markdown_parts.append(numbered_markdown_body)
    processed_markdown_with_toc = "".join(final_markdown_parts)

    # Final encoding cleanup
    processed_markdown_with_toc = fix_encoding_issues(processed_markdown_with_toc)

    # --- 7. Create Basic HTML Version ---
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{doc_title}</title>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: auto; color: #333; }}
        h1 {{ text-align: center; color: #2c3e50; margin-bottom: 1em; }}
        h2 {{ color: #3498db; border-bottom: 1px solid #ecf0f1; padding-bottom: 0.2em; margin-top: 1.5em; }}
        h3 {{ color: #2980b9; margin-top: 1.2em; }}
        a {{ color: #3498db; }}
        pre {{ background: #f8f8f8; padding: 15px; border-radius: 5px; overflow-x: auto; }}
    </style>
</head>
<body>
    <pre>{processed_markdown_with_toc}</pre>
</body>
</html>"""

    # --- 8. Statistics Summary ---
    stats_dict = {
        'total_quotes_in_report': len(report_quotes),
        'total_quotes_in_database': len(quotes_list),
        'successful_matches': linked_count,
        'match_rate': f"{(linked_count/len(report_quotes)*100):.1f}%" if report_quotes else "0%",
        'subreddits_analyzed': list(db_quotes_by_subreddit.keys()),
        'similarity_threshold_used': "98% (subreddit-specific), 95% (cross-subreddit)"
    }
    
    # Add sample matches for debugging
    if all_matches:
        stats_dict['sample_matches'] = [
            {
                'report_text': match['report_quote']['text'][:100] + "...",
                'db_text': match['db_quote'].get('text', '')[:100] + "...",
                'similarity': f"{match['similarity']:.3f}",
                'subreddit': match['db_quote'].get('subreddit', 'unknown')
            }
            for match in all_matches[:3]  # First 3 matches
        ]
    
    stats_json_string = json.dumps(stats_dict, indent=2)
    
    return processed_markdown_with_toc, stats_json_string, html_content