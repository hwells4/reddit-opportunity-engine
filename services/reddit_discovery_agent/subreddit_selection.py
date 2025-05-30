import os
import json
import requests
from typing import Dict, Any, List, Union, Optional
from rich.console import Console
from rich.prompt import Prompt
from rich.panel import Panel
from prompt_toolkit import Application
from prompt_toolkit.layout import Layout, HSplit, VSplit
from prompt_toolkit.widgets import Frame, Label, Box
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.styles import Style
from prompt_toolkit.formatted_text import HTML
from subreddit_utils import get_subreddit_info

# Setup console for better output
console = Console()

def select_subreddits_for_analysis(
    result: Dict[str, Any], 
    target_audience: str,
    problem_area: str, 
    product_type: str,
    additional_context: Optional[str] = None
) -> Union[List[Dict[str, Any]], bool]:
    """
    Interactive UI to select subreddits for further analysis.
    
    Args:
        result: The results dictionary from the search agent
        target_audience: The target audience for the product
        problem_area: The problem area the product addresses
        product_type: The type of product
        additional_context: Any additional context about the product
        
    Returns:
        List of selected subreddits or False if operation was cancelled
    """
    console.print("\n[bold cyan]===== SELECT SUBREDDITS FOR ANALYSIS =====[/bold cyan]")
    console.print("[yellow]Creating interactive selection interface...[/yellow]")
    
    # Combine all categories into a single list for selection
    all_subreddits = []
    categories = result["categories"]
    
    for category, subs in categories.items():
        for sub in subs:
            all_subreddits.append(sub)
    
    # Sort by subscriber count (descending)
    all_subreddits.sort(key=lambda x: x["subscribers"], reverse=True)
    
    # Create interactive interface using prompt_toolkit
    selected_subreddits = interactive_subreddit_selector(all_subreddits)
    
    if not selected_subreddits:
        console.print("[yellow]No subreddits selected. Exiting.[/yellow]")
        return []
    
    console.clear()
    console.print("[bold green]Selected Subreddits:[/bold green]")
    for sub in selected_subreddits:
        console.print(f"  • {sub['name']} ({sub['subscribers']:,} subscribers)")
    
    # Ask if user wants to add additional subreddits
    add_more = Prompt.ask(
        "\n[bold cyan]Would you like to add any additional subreddits that weren't found in the search?[/bold cyan]",
        choices=["y", "n"],
        default="n"
    )
    
    if add_more.lower() == "y":
        additional_subreddits = add_additional_subreddits()
        if additional_subreddits:
            selected_subreddits.extend(additional_subreddits)
            console.print("\n[bold green]Updated Selected Subreddits:[/bold green]")
            for sub in selected_subreddits:
                console.print(f"  • {sub['name']} ({sub['subscribers']:,} subscribers)")
    
    # Handle email and API payload creation
    return prepare_and_send_webhook(
        selected_subreddits, 
        target_audience,
        problem_area,
        product_type,
        additional_context
    )

def add_additional_subreddits() -> List[Dict[str, Any]]:
    """
    Allow users to add additional subreddits with validation and metadata fetching.
    
    Returns:
        List of validated additional subreddit dictionaries
    """
    additional_subreddits = []
    
    console.print(Panel.fit(
        "[bold]Add Additional Subreddits[/bold]\n\n"
        "Enter subreddit names (with or without 'r/' prefix) separated by commas.\n"
        "We'll validate them and fetch their subscriber counts.\n\n"
        "Example: entrepreneur, startups, r/SaaS, indiehackers"
    ))
    
    while True:
        subreddit_input = Prompt.ask(
            "\n[bold cyan]Enter subreddit names (comma-separated) or 'done' to finish[/bold cyan]",
            default=""
        )
        
        if subreddit_input.lower() in ['done', 'exit', 'quit', '']:
            break
            
        # Parse the input
        subreddit_names = [name.strip() for name in subreddit_input.split(',') if name.strip()]
        
        if not subreddit_names:
            console.print("[yellow]No subreddits entered. Try again or type 'done' to finish.[/yellow]")
            continue
            
        console.print(f"\n[yellow]Validating {len(subreddit_names)} subreddit(s)...[/yellow]")
        
        # Validate each subreddit
        for subreddit_name in subreddit_names:
            # Clean the subreddit name
            clean_name = subreddit_name.lower().strip()
            if clean_name.startswith('r/'):
                clean_name = clean_name[2:]
            elif clean_name.startswith('/r/'):
                clean_name = clean_name[3:]
            
            # Skip if already in the list
            if any(sub['name'].lower() == f"r/{clean_name}" for sub in additional_subreddits):
                console.print(f"[yellow]⚠️ {clean_name} already added, skipping[/yellow]")
                continue
                
            console.print(f"[yellow]Checking[/yellow] r/{clean_name}...")
            
            # Get subreddit info
            info = get_subreddit_info(clean_name)
            
            if info:
                # Successfully validated
                metadata = {
                    "name": f"r/{info.get('display_name', clean_name)}",
                    "title": info.get('title', ''),
                    "subscribers": info.get('subscribers', 0),
                    "description": info.get('public_description', ''),
                    "url": info.get('url', ''),
                    "created_utc": info.get('created_utc', 0),
                    "over18": info.get('over18', False),
                    "active_users": info.get('active_user_count', 0),
                    "is_niche": info.get('subscribers', 0) < 750000,  # Using same threshold as search agent
                    "selection_reason": "Manually added by user"
                }
                
                subscriber_count = metadata['subscribers']
                
                # Check minimum threshold (same as search agent)
                if subscriber_count < 5000:
                    console.print(f"[yellow]✓ Validated but too small[/yellow] r/{clean_name} - {subscriber_count:,} subscribers (minimum 5,000)")
                    continue
                    
                additional_subreddits.append(metadata)
                console.print(f"[green]✓ Added[/green] r/{clean_name} - {subscriber_count:,} subscribers")
            else:
                console.print(f"[red]✗ Could not validate[/red] r/{clean_name} - subreddit may not exist or be private")
        
        if additional_subreddits:
            console.print(f"\n[bold green]Added {len(additional_subreddits)} additional subreddit(s):[/bold green]")
            for sub in additional_subreddits:
                console.print(f"  • {sub['name']} ({sub['subscribers']:,} subscribers)")
        
        # Ask if they want to add more
        add_more = Prompt.ask(
            "\n[bold cyan]Add more subreddits?[/bold cyan]",
            choices=["y", "n"],
            default="n"
        )
        
        if add_more.lower() != "y":
            break
    
    return additional_subreddits

def interactive_subreddit_selector(subreddits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Create an interactive interface to select subreddits using prompt_toolkit.
    
    Args:
        subreddits: List of subreddit dictionaries
        
    Returns:
        List of selected subreddits
    """
    # Add a max limit of 8 selections
    max_selections = 8
    
    # Track selection state
    selected_indices = []
    current_index = 0
    
    # List to hold the Label widgets
    subreddit_labels = []
    
    # Define key bindings
    kb = KeyBindings()
    
    @kb.add('q')
    def _(event):
        event.app.exit()
    
    @kb.add('up')
    def _(event):
        nonlocal current_index
        current_index = max(0, current_index - 1)
        update_labels()
    
    @kb.add('down')
    def _(event):
        nonlocal current_index
        current_index = min(len(subreddits) - 1, current_index + 1)
        update_labels()
    
    @kb.add('enter')
    def _(event):
        nonlocal selected_indices
        if current_index in selected_indices:
            selected_indices.remove(current_index)
        elif len(selected_indices) < max_selections:
            selected_indices.append(current_index)
        update_labels()
    
    @kb.add('s')
    def _(event):
        if selected_indices:
            event.app.exit(result=selected_indices)
        else:
            update_status_label("Please select at least one subreddit")
    
    # Create status label at the bottom
    status_label = Label(text="Up/Down: Navigate | Enter: Select/Deselect | s: Submit | q: Quit")
    selection_count_label = Label(text="Selected: 0/8")
    
    def update_status_label(message):
        status_label.text = message
    
    def update_selection_count():
        selection_count_label.text = f"Selected: {len(selected_indices)}/{max_selections}"
    
    # Create labels for each subreddit
    for _ in subreddits:
        subreddit_labels.append(Label(text=""))
    
    def update_labels():
        for i, sub in enumerate(subreddits):
            # Format the subreddit text
            subscriber_count = f"{sub['subscribers']:,}"
            is_selected = i in selected_indices
            is_current = i == current_index
            
            # Create the display text
            if is_selected:
                marker = "[x]"
                style = "fg:green"
            else:
                marker = "[ ]"
                style = ""
            
            # Highlight current selection
            if is_current:
                style = "reverse"
            
            text = f"{marker} {sub['name']} ({subscriber_count} subscribers)"
            subreddit_labels[i].text = HTML(f"<{style}>{text}</{style}>") if style else text
        
        update_selection_count()
    
    # Initial update
    update_labels()
    
    # Create the layout
    header = Label(text=HTML("<b>Select Subreddits for Analysis</b>"))
    help_text = Label(text="Select up to 8 subreddits for analysis")
    
    # Create a container for scrollable content
    content_box = HSplit(subreddit_labels)
    
    # Main layout
    root_container = Frame(
        HSplit([
            header,
            help_text,
            selection_count_label,
            Box(content_box, padding=1),
            status_label
        ])
    )
    
    # Define styles
    style = Style.from_dict({
        'frame.border': '#00FFFF',
        'frame.label': 'bg:#00FFFF #ffffff',
    })
    
    # Create the application
    application = Application(
        layout=Layout(root_container),
        key_bindings=kb,
        style=style,
        full_screen=True,
        mouse_support=True
    )
    
    # Run the application and return selected subreddits
    try:
        # Instead of application.run(), use this to be compatible with existing event loop
        selected = application.run_async().result()
        
        if selected is None:
            return []
        
        return [subreddits[i] for i in selected]
    except Exception as e:
        console.print(f"[bold red]Error in UI: {str(e)}[/bold red]")
        
        # Fallback to simple CLI selection if the UI fails
        return cli_fallback_selection(subreddits)

def cli_fallback_selection(subreddits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Fallback CLI selection method if the UI fails"""
    console.print("[yellow]Using fallback CLI selection method...[/yellow]")
    
    # Display all subreddits
    console.print("\n[bold cyan]Available Subreddits:[/bold cyan]")
    for i, sub in enumerate(subreddits):
        console.print(f"{i+1}. {sub['name']} ({sub['subscribers']:,} subscribers)")
    
    # Get selection input
    console.print("\n[bold yellow]Enter the numbers of subreddits to select (comma separated, max 8):[/bold yellow]")
    selection = Prompt.ask("Selection")
    
    try:
        # Parse selection
        indices = [int(idx.strip()) - 1 for idx in selection.split(',') if idx.strip()]
        indices = [idx for idx in indices if 0 <= idx < len(subreddits)][:8]  # Limit to 8
        return [subreddits[i] for i in indices]
    except:
        console.print("[bold red]Invalid selection. Using top 5 subreddits.[/bold red]")
        return subreddits[:5]  # Return top 5 as default

def prepare_and_send_webhook(
    selected_subreddits: List[Dict[str, Any]],
    target_audience: str,
    problem_area: str,
    product_type: str,
    additional_context: Optional[str] = None
) -> Union[List[Dict[str, Any]], bool]:
    """
    Prepare the payload and send it to the Gumloop API if confirmed.
    
    Args:
        selected_subreddits: List of selected subreddit dictionaries
        target_audience: The target audience for the product
        problem_area: The problem area the product addresses
        product_type: The type of product
        additional_context: Any additional context about the product
        
    Returns:
        List of selected subreddits or False if operation was cancelled/failed
    """
    # Get user email
    console.print("\n[bold cyan]Please provide your email to receive the analysis report:[/bold cyan]")
    email = Prompt.ask("Email", default="")
    
    # Prompt for post limit
    console.print("\n[bold cyan]How many posts would you like to analyze per subreddit?[/bold cyan]")
    console.print("[dim](Higher values provide more data but may take longer to process)[/dim]")
    post_limit = Prompt.ask("Post limit", default="75")
    
    # Format the data that would be sent to the API
    # Remove 'r/' prefix from subreddit names
    subreddit_names = [sub["name"].replace('r/', '') for sub in selected_subreddits]
    subscriber_counts = [str(sub["subscribers"]) for sub in selected_subreddits]
    
    # Format as semicolon-separated strings
    subreddits_str = ";".join(subreddit_names)
    subscribers_str = ";".join(subscriber_counts)
    
    # Create the payload according to the required format
    pipeline_inputs = [
        {"input_name": "email", "value": email},
        {"input_name": "subscribers", "value": subscribers_str},
        {"input_name": "post_limit", "value": post_limit},
        {"input_name": "name", "value": ""},
        {"input_name": "subreddits", "value": subreddits_str},
        {"input_name": "audience", "value": target_audience},
        {"input_name": "problem_area", "value": problem_area},
        {"input_name": "product_type", "value": product_type},
        {"input_name": "features", "value": ""},
        {"input_name": "value_prop", "value": ""},
        {"input_name": "context", "value": additional_context or ""}
    ]
    
    payload = {
        "user_id": os.getenv("GUMLOOP_USER_ID", "EZUCg1VIYohJJgKgwDTrTyH2sC32"),
        "saved_item_id": os.getenv("GUMLOOP_SAVED_ITEM_ID", "aoq3DjMNT9hRP3JMHfosBT"),
        "pipeline_inputs": pipeline_inputs
    }
    
    # Show the formatted payload before sending
    console.print("\n[bold cyan]API request payload (for verification):[/bold cyan]")
    formatted_json = json.dumps(payload, indent=2)
    console.print(f"[dim cyan]{formatted_json}[/dim cyan]")
    
    # Ask for confirmation before sending
    should_send = Prompt.ask(
        "\nSend this request to the API?", 
        choices=["y", "n", "test"], 
        default="test"
    )
    
    if should_send.lower() == "n":
        console.print("[yellow]Request cancelled.[/yellow]")
        return False
        
    if should_send.lower() == "test":
        console.print("[bold green]✅ Test completed successfully![/bold green]")
        console.print("[yellow]This was a test run. No API request was sent.[/yellow]")
        return selected_subreddits
    
    # Send the request to the API
    return send_to_webhook(payload, email, selected_subreddits)

def send_to_webhook(
    payload: Dict[str, Any], 
    email: str, 
    selected_subreddits: List[Dict[str, Any]]
) -> Union[List[Dict[str, Any]], bool]:
    """
    Format and send the selected subreddits to the Gumloop API.
    
    Args:
        payload: The prepared API payload
        email: The user's email
        selected_subreddits: The list of selected subreddits
    
    Returns:
        List of selected subreddits if successful, False otherwise
    """
    # Set constants for the API
    API_URL = "https://api.gumloop.com/api/v1/start_pipeline"
    API_KEY = os.getenv("GUMLOOP_API_KEY")
    
    # Check if API key exists
    if not API_KEY:
        console.print("[bold red]Error: GUMLOOP_API_KEY environment variable is not set[/bold red]")
        console.print("[yellow]Please set this variable in your .env file and try again[/yellow]")
        return False
        
    # Actually send the request
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
        
        response = requests.post(API_URL, json=payload, headers=headers)
        
        if response.status_code == 200:
            console.print("[bold green]✅ Successfully sent request to Gumloop API![/bold green]")
            console.print(f"Response: {response.text}")
            return selected_subreddits
        else:
            console.print(f"[bold red]Error: API returned status code {response.status_code}[/bold red]")
            console.print(response.text)
            return False
    except Exception as e:
        console.print(f"[bold red]Error sending to API: {str(e)}[/bold red]")
        return False

# If this file is run directly, it will perform a test
if __name__ == "__main__":
    # Test data
    test_result = {
        "categories": {
            "large_communities": [
                {"name": "r/TestLarge1", "subscribers": 2000000, "description": "A test large community"},
                {"name": "r/TestLarge2", "subscribers": 1500000, "description": "Another test large community"}
            ],
            "medium_communities": [
                {"name": "r/TestMedium1", "subscribers": 800000, "description": "A test medium community"},
                {"name": "r/TestMedium2", "subscribers": 600000, "description": "Another test medium community"}
            ],
            "niche_communities": [
                {"name": "r/TestNiche1", "subscribers": 200000, "description": "A test niche community"},
                {"name": "r/TestNiche2", "subscribers": 100000, "description": "Another test niche community"},
                {"name": "r/TestNiche3", "subscribers": 50000, "description": "Yet another test niche community"}
            ]
        }
    }
    
    # Test the selection UI
    selected = select_subreddits_for_analysis(
        test_result,
        "Test audience",
        "Test problem area",
        "Test product type"
    )
    
    print("\nTest complete. Selected subreddits:", selected) 