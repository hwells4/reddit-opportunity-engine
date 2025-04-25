from pydantic import BaseModel, Field
from typing import List, Optional

class SubredditRecommendation(BaseModel):
    """Represents a single recommended subreddit."""
    subreddit_name: str = Field(..., description="The full name of the subreddit, starting with r/ (e.g., r/indiehackers)")
    subscriber_count: Optional[str] = Field(None, description="Approximate subscriber count if readily available from search results. State 'Unknown' if not found.")
    relevance_explanation: str = Field(..., description="Detailed explanation (2-3 sentences) of why this subreddit is relevant to the user's focus area, based on search results or known characteristics.")
    content_type: str = Field(..., description="Typical content types found (e.g., questions, discussions, project showcases, support requests, news sharing).")
    audience_alignment: str = Field(..., description="How the subreddit's likely audience aligns with the user's specified target audience.")

class SubredditOutput(BaseModel):
    """The final structured output containing subreddit recommendations and search suggestions."""
    subreddit_recommendations: List[SubredditRecommendation] = Field(
        ...,
        description="A list of 3 to 5 highly relevant subreddit recommendations based on the user's focus. Prioritize active communities related to the specific problem area and target audience.",
        min_length=3,
        max_length=5
    )
    search_suggestions: List[str] = Field(
        ...,
        description="A list of 3-5 specific and actionable search terms or phrases to use within the recommended subreddits to find relevant discussions (e.g., 'early user feedback', 'marketing side project', 'launch strategy discussion')."
    )
