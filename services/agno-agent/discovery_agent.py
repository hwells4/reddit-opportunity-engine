import os
from textwrap import dedent
from dotenv import load_dotenv
from rich.pretty import pprint
from rich.console import Console
from typing import Optional

from agno.agent import Agent
from agno.models.openrouter import OpenRouter
from agno.tools.duckduckgo import DuckDuckGoTools

# Import the Pydantic models from models.py
from models import SubredditOutput

# Load environment variables from .env file
load_dotenv()

# Setup console for better output
console = Console()

def run_discovery_agent(
    problem_area: Optional[str] = None,
    product_type: Optional[str] = None,
    target_audience: Optional[str] = None,
    additional_context: Optional[str] = None,
    model_id: Optional[str] = None
):
    """
    Initializes and runs the Reddit discovery agent with structured inputs using OpenRouter.
    Requires at least problem_area OR product_type.
    """

    # --- Input Validation ---
    if not problem_area and not product_type:
        console.print("[bold red]Error: At least 'problem_area' or 'product_type' must be provided.[/]")
        return

    openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
    if not openrouter_api_key:
        console.print("[bold red]Error: OPENROUTER_API_KEY environment variable not set.[/]")
        return

    # --- Model Selection ---
    # Default to the desired Gemini 2.5 Flash Preview model
    default_model = "google/gemini-2.5-flash-preview"
    chosen_model_id = model_id or os.getenv("OPENROUTER_MODEL", default_model)
    console.print(f"[cyan]Using OpenRouter model:[/cyan] {chosen_model_id}")

    # --- Instantiate Agno's OpenRouter Model Wrapper ---
    model = OpenRouter(id=chosen_model_id)
    tools = [DuckDuckGoTools()]

    # Prepare context for the agent
    agent_context = {
        "problem_area": problem_area or "Not specified",
        "product_type": product_type or "Not specified",
        "target_audience": target_audience or "Not specified",
        "additional_context": additional_context or "None",
    }

    # --- Prepare Optional Headers for OpenRouter ---
    request_headers = {}
    site_url = os.getenv("YOUR_SITE_URL")
    site_name = os.getenv("YOUR_SITE_NAME")
    if site_url:
        request_headers["HTTP-Referer"] = site_url
    if site_name:
        request_headers["X-Title"] = site_name

    reddit_discoverer = Agent(
        model=model,
        tools=tools,
        response_model=SubredditOutput,
        description=dedent("""\
            You are an expert Reddit Community Discovery Specialist. Your goal is to help entrepreneurs find the most relevant subreddits for researching product opportunities based on their stated interests and needs."""),
        instructions=[
            # Use context variables directly in instructions
            "Carefully analyze the user's focus area:",
            " - Product Type: {product_type}",
            " - Problem Area: {problem_area}",
            " - Target Audience: {target_audience}",
            " - Additional Context: {additional_context}",
            "Use the DuckDuckGo search tool to find potential subreddits relevant to these details. Focus searches on the problem area and target audience.",
            "Analyze search results critically. Prioritize subreddits that seem active and directly relevant to the specific problem area and target audience.",
            "Select the 3 to 5 most promising subreddits.",
            "For each selected subreddit, use search results or your general knowledge to fill in the required fields: name (must start with r/), subscriber count (if available, else 'Unknown'), relevance explanation, typical content type, and audience alignment.",
            "Generate 3-5 specific search term suggestions relevant to the user's problem area that they could use within the recommended subreddits.",
            "IMPORTANT: Your final output MUST be ONLY the structured data conforming to the 'SubredditOutput' model. Do not include any introductory or concluding conversational text.",
        ],
        # Context is passed during the run, but enabling this makes it available in instructions
        add_state_in_messages=True, # Necessary to make {variables} work in instructions
        show_tool_calls=False,
        markdown=False,
    )

    console.print("\n[bold yellow]🔎 Finding relevant subreddits...[/bold yellow]")
    try:
        # Run the agent, passing structured inputs via context
        # The main "prompt" to run can be simple, as details are in context/instructions
        run_prompt = f"Find relevant subreddits for problem: {problem_area or product_type}"
        
        # Pass optional headers during the run call if available
        request_options = {"headers": request_headers} if request_headers else {}
        
        response: SubredditOutput | None = reddit_discoverer.run(
            run_prompt,
            context=agent_context, # Pass the structured data here
            request_options=request_options # Attempt to pass headers
        )

        console.print("\n[bold green]✅ Discovery Complete:[/bold green]")
        if response:
            pprint(response)
        else:
            console.print("[bold red]Agent did not return a valid structured response.[/]")
            if reddit_discoverer.run_response and reddit_discoverer.run_response.error:
                 console.print(f"[red]Error details: {reddit_discoverer.run_response.error}[/red]")

    except Exception as e:
        console.print(f"[bold red]An unexpected error occurred:[/bold red] {e}")
        # You might want to log the full traceback here for debugging
        # import traceback
        # traceback.print_exc()


# --- Example Usage ---
if __name__ == "__main__":
    run_discovery_agent(
        # model_id="specify/another-model-if-needed", # Example override
        product_type="SaaS for indie developers",
        problem_area="Difficulty finding early adopters and getting initial feedback for new side projects. Struggling with marketing and launch strategies.",
        target_audience="Solo developers, bootstrappers, indie hackers building and launching their own software products.",
        additional_context="Looking specifically for communities where developers openly discuss their marketing/growth challenges, share launch experiences (successes and failures), and give feedback on each other's projects. Less interested in purely technical coding help forums."
    )
    # Example with fewer inputs (meeting the requirement)
    # print("\n" + "="*20 + " Second Run " + "="*20 + "\n")
    # run_discovery_agent(
    #     problem_area="Finding good remote freelance writing jobs",
    #     target_audience="Beginner freelance writers"
    # )
