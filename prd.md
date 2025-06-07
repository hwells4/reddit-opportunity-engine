# Reddit Discovery Slack Bot: Product Requirements Document (PRD)

## Executive Summary

A conversational Slack bot that replicates and enhances the existing CLI-based Reddit discovery workflow. Users can trigger discovery through natural conversation, iteratively refine parameters, select subreddits, configure campaigns, and launch automated outreach—all without leaving Slack.

## Product Vision

Transform the manual CLI process into a seamless conversational experience where users can:
- Paste customer conversations and get intelligent parameter extraction
- Iteratively refine discovery parameters through natural dialogue
- Review and select discovered subreddits with rich previews
- Configure and launch campaigns directly from Slack
- Track progress and receive notifications in real-time

## Current State vs. Target State

### Current CLI Workflow:
1. Run `python mvp_flow.py`
2. Answer prompts for product type, problem area, target audience, context
3. Wait for Reddit discovery to complete
4. Review discovered subreddits in terminal
5. Manually select relevant subreddits
6. Add additional subreddits if needed
7. Provide email and post limit
8. Trigger Gumloop webhook
9. Receive email notification when complete

### Target Slack Workflow:
1. **Trigger**: `@reddit-bot` or `/reddit-discover`
2. **Conversation**: Paste customer conversation or describe product
3. **Refinement**: Bot extracts parameters, user iterates until satisfied
4. **Discovery**: Bot triggers Reddit search, provides real-time updates
5. **Selection**: Interactive subreddit selection with previews and actions
6. **Enhancement**: Add custom subreddits with validation
7. **Configuration**: Set email and post limits through simple prompts
8. **Launch**: Confirm and trigger Gumloop pipeline
9. **Completion**: Receive success notification with tracking details

## Core Features

### 1. Conversational Parameter Extraction
**Purpose**: Intelligently extract and refine the four core parameters through natural dialogue

**Functionality**:
- Accept pasted customer conversations, product descriptions, or free-form text
- Use LLM to extract initial parameters (product type, problem area, target audience, additional context)
- Present extracted parameters for user review
- Allow iterative refinement through conversational feedback
- Maintain context across multiple refinement cycles

**User Experience**:
```
User: @reddit-bot analyze this conversation: [pastes customer chat]

Bot: 📋 I've analyzed your conversation. Here's what I extracted:

**Product Type**: SaaS productivity tool
**Problem Area**: Remote team communication and project tracking
**Target Audience**: Small to medium tech startups (10-50 employees)
**Additional Context**: Looking for technical feedback on integration capabilities

Does this look accurate? You can ask me to adjust any of these.

User: The audience should focus more on engineering managers specifically

Bot: ✅ Updated target audience to "Engineering managers at tech startups"

Here's the refined analysis:
**Product Type**: SaaS productivity tool  
**Problem Area**: Remote team communication and project tracking
**Target Audience**: Engineering managers at tech startups
**Additional Context**: Looking for technical feedback on integration capabilities

Ready to search for Reddit communities, or need more adjustments?
```

### 2. Stateful Session Management
**Purpose**: Maintain conversation context and progress across all interactions

**Technical Implementation**:
- Persistent session storage per user/channel
- State machine with defined stages: `GATHERING`, `REFINING`, `SEARCHING`, `SELECTING`, `CONFIGURING`, `LAUNCHING`
- Session timeout and cleanup (24-hour TTL)
- Ability to resume interrupted conversations
- Context preservation across Slack app restarts

**Session Data Structure**:
```python
{
    "user_id": "U123456",
    "channel_id": "C789012", 
    "state": "SELECTING_SUBREDDITS",
    "created_at": "2024-01-15T10:30:00Z",
    "last_activity": "2024-01-15T10:45:00Z",
    "parameters": {
        "product_type": "SaaS productivity tool",
        "problem_area": "Remote team communication",
        "target_audience": "Engineering managers at tech startups", 
        "additional_context": "Technical feedback on integrations"
    },
    "discovery": {
        "search_id": "uuid-123",
        "discovered_subreddits": [...],
        "selected_subreddits": ["r/engineering", "r/startups"],
        "custom_subreddits": ["r/devops"]
    },
    "campaign": {
        "email": "user@company.com",
        "post_limit": 75,
        "gumloop_run_id": null
    }
}
```

### 3. Reddit Discovery Integration
**Purpose**: Seamlessly integrate with existing Reddit Discovery API while providing real-time updates

**Functionality**:
- Call existing FastAPI `/discover` endpoint with extracted parameters
- Poll `/search/{search_id}/status` for real-time progress updates
- Display progress indicators and status messages in Slack
- Handle API errors gracefully with retry options
- Format discovered subreddits for interactive selection

**User Experience**:
```
User: Yes, let's search for communities

Bot: 🚀 Starting Reddit discovery...
     This usually takes 2-3 minutes. I'll keep you updated!

[30 seconds later]
Bot: 📊 Analyzing 1,247 potential communities...

[1 minute later]  
Bot: 🎯 Found 15 highly relevant communities, validating them now...

[2 minutes later]
Bot: ✅ Discovery complete! Found 8 validated communities with 450K+ potential users.
     
     Ready to review the results?
```

### 4. Interactive Subreddit Selection
**Purpose**: Allow users to review, select, and enhance discovered subreddits through rich Slack UI

**Functionality**:
- Display subreddits with rich formatting (name, member count, description, relevance reason)
- Checkbox-style selection with visual feedback
- "View on Reddit" links for each subreddit
- Ability to add custom subreddits with validation
- Selection summary and modification options

**User Experience**:
```
Bot: 🎯 Here are your discovered Reddit communities:

✅ **r/engineering** (2.1M members) - Selected
    Engineering discussions and career advice
    *Why relevant: Target audience of engineering managers*
    [View on Reddit] [Remove Selection]

☐ **r/startups** (890K members) 
    Startup discussions and founder community  
    *Why relevant: Tech startup focus matches target market*
    [View on Reddit] [Select]

☐ **r/devops** (180K members)
    DevOps tools and practices
    *Why relevant: Technical integration discussions*
    [View on Reddit] [Select]

[Show 5 more] [Add Custom Subreddit] [Continue with Selected (1)]

User: Select r/startups and add r/remotework

Bot: ✅ Added r/startups to selection
     🔍 Validating r/remotework... ✅ Valid subreddit added!
     
     **Current Selection (3 subreddits)**:
     • r/engineering (2.1M members)
     • r/startups (890K members)  
     • r/remotework (1.2M members)
     
     Total potential reach: 4.2M users
     
     Ready to configure your campaign?
```

### 5. Campaign Configuration
**Purpose**: Collect email and post limit settings through conversational prompts

**Functionality**:
- Smart email validation and suggestions
- Post limit selection with recommendations based on subreddit size
- Configuration summary and modification options
- Integration with existing Gumloop pipeline parameters

**User Experience**:
```
Bot: 📧 What email should I send the results to?

User: harrison@company.com

Bot: ✅ Email set to harrison@company.com

     📊 How many posts should I analyze per subreddit?
     
     Recommended: 75 posts (good balance of quality and speed)
     
     [25 posts] [50 posts] [75 posts] [100 posts] [Custom]

User: 75 posts

Bot: ✅ Configuration complete!
     
     **Campaign Summary**:
     📧 Email: harrison@company.com
     📊 Posts per subreddit: 75
     🎯 Target subreddits: 3 communities (4.2M total users)
     
     Ready to launch? This will start the automated analysis and outreach process.
     
     [🚀 Launch Campaign] [✏️ Edit Settings] [❌ Cancel]
```

### 6. Gumloop Pipeline Integration
**Purpose**: Trigger existing Gumloop webhook with collected parameters and track execution

**Functionality**:
- Format parameters for Gumloop API compatibility
- Call existing `/api/start-pipeline` endpoint
- Store and track Gumloop run ID
- Provide tracking URL for campaign monitoring
- Handle pipeline errors and retry logic

**User Experience**:
```
User: 🚀 Launch Campaign

Bot: 🎉 Campaign launched successfully!
     
     **Campaign Details**:
     🆔 Run ID: abc123-def456-ghi789
     📊 Analyzing 225 posts across 3 subreddits
     ⏱️ Estimated completion: 15-20 minutes
     
     📧 You'll receive a detailed report at harrison@company.com when complete.
     
     [📈 Track Progress] [🔄 Start New Search] [❓ Help]

[15 minutes later]
Bot: ✅ Campaign complete! Check your email for the full analysis report.
     
     Great job! 🎯 Found high-quality opportunities across your target communities.
```

## Technical Architecture

### Core Components

#### 1. Slack Bot Service
- **Framework**: Slack Bolt SDK (Python)
- **Hosting**: Railway (always-on service)
- **Session Storage**: Redis for persistent state management
- **LLM Integration**: OpenRouter API for parameter extraction and refinement

#### 2. State Management System
```python
class ConversationState(Enum):
    GATHERING = "gathering"           # Initial parameter extraction
    REFINING = "refining"            # Iterative parameter refinement  
    SEARCHING = "searching"          # Reddit discovery in progress
    SELECTING = "selecting"          # Subreddit selection and customization
    CONFIGURING = "configuring"      # Email and post limit configuration
    LAUNCHING = "launching"          # Gumloop pipeline execution
    COMPLETE = "complete"            # Campaign launched successfully

class SessionManager:
    def get_session(self, user_id: str) -> ConversationSession
    def update_session(self, session: ConversationSession) -> None
    def cleanup_expired_sessions(self) -> None
```

#### 3. Integration Layer
- **Reddit Discovery API**: Existing FastAPI service
- **Gumloop Pipeline**: Existing webhook integration
- **LLM Service**: Parameter extraction and conversation management

### API Endpoints

#### Slack Bot Endpoints
```
POST /slack/events          # Slack event subscriptions
POST /slack/interactive     # Interactive component handling  
POST /slack/commands        # Slash command handling
GET  /health               # Health check for Railway
```

#### Internal API Methods
```python
async def extract_parameters(text: str) -> Dict[str, str]
async def refine_parameters(current: Dict, feedback: str) -> Dict[str, str]  
async def start_reddit_discovery(params: Dict) -> str
async def poll_discovery_status(search_id: str) -> Dict
async def validate_subreddit(subreddit: str) -> bool
async def launch_gumloop_pipeline(config: Dict) -> Dict
```

### Data Models

#### Conversation Session
```python
@dataclass
class ConversationSession:
    user_id: str
    channel_id: str
    state: ConversationState
    created_at: datetime
    last_activity: datetime
    
    # Discovery parameters
    product_type: Optional[str] = None
    problem_area: Optional[str] = None  
    target_audience: Optional[str] = None
    additional_context: Optional[str] = None
    
    # Discovery results
    search_id: Optional[str] = None
    discovered_subreddits: List[Dict] = field(default_factory=list)
    selected_subreddits: List[str] = field(default_factory=list)
    custom_subreddits: List[str] = field(default_factory=list)
    
    # Campaign configuration
    email: Optional[str] = None
    post_limit: int = 75
    gumloop_run_id: Optional[str] = None
```

#### Subreddit Data
```python
@dataclass  
class SubredditInfo:
    name: str
    subscriber_count: int
    description: str
    relevance_reason: str
    is_recommended: bool
    recommendation_rank: Optional[int] = None
    url: str = field(init=False)
    
    def __post_init__(self):
        self.url = f"https://reddit.com/r/{self.name}"
```

## User Commands and Interactions

### Slash Commands
- `/reddit-discover` - Start new discovery session
- `/reddit-status` - Check current session status  
- `/reddit-help` - Show help and available commands
- `/reddit-reset` - Reset current session

### Natural Language Triggers
- `@reddit-bot analyze this conversation: [text]`
- `@reddit-bot help me find communities for [product]`
- `@reddit-bot start discovery`

### Interactive Components
- **Parameter Refinement**: Buttons for quick edits
- **Subreddit Selection**: Checkboxes and action buttons
- **Configuration**: Form inputs and preset options
- **Campaign Launch**: Confirmation dialogs and tracking links

## Error Handling and Edge Cases

### Session Management
- **Expired Sessions**: Auto-cleanup with graceful restart options
- **Concurrent Sessions**: One active session per user, with override capability
- **Invalid State**: Automatic state recovery and user notification

### API Integration
- **Reddit API Failures**: Retry logic with exponential backoff
- **Gumloop Errors**: Error reporting with manual retry options
- **Network Issues**: Graceful degradation with status updates

### User Input Validation
- **Invalid Subreddits**: Real-time validation with suggestions
- **Malformed Email**: Format validation with correction prompts
- **Empty Parameters**: Required field enforcement with helpful guidance

### Slack Platform Issues
- **Rate Limiting**: Request queuing and user notification
- **Message Limits**: Content truncation with "show more" options
- **Interactive Component Timeouts**: Session preservation and recovery

## Success Metrics

### User Experience Metrics
- **Session Completion Rate**: % of started sessions that reach campaign launch
- **Parameter Refinement Cycles**: Average iterations before user confirmation
- **Time to Launch**: Duration from trigger to campaign launch
- **User Satisfaction**: Post-interaction feedback scores

### Technical Performance Metrics  
- **Response Time**: < 2 seconds for all bot interactions
- **API Success Rate**: > 99% successful Reddit discovery calls
- **Session Persistence**: Zero data loss during bot restarts
- **Error Recovery Rate**: % of errors resolved without user intervention

### Business Impact Metrics
- **Daily Active Users**: Unique users per day
- **Campaign Launch Rate**: Successful campaigns per session
- **Discovery Quality**: User-reported relevance of discovered subreddits
- **Time Savings**: Reduction vs. manual CLI workflow

## Deployment and Infrastructure

### Railway Configuration
```yaml
# railway.toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "services/slack_bot/Dockerfile"

[deploy]
startCommand = "python bot.py"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"

[variables]
SLACK_BOT_TOKEN = { $ref = "SLACK_BOT_TOKEN" }
SLACK_APP_TOKEN = { $ref = "SLACK_APP_TOKEN" }  
OPENROUTER_API_KEY = { $ref = "OPENROUTER_API_KEY" }
REDDIT_API_URL = { $ref = "REDDIT_API_URL" }
GUMLOOP_API_KEY = { $ref = "GUMLOOP_API_KEY" }
REDIS_URL = { $ref = "REDIS_URL" }
```

### Environment Variables
```bash
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret

# External APIs
OPENROUTER_API_KEY=your-openrouter-key
REDDIT_API_URL=https://your-reddit-api.railway.app
GUMLOOP_API_KEY=your-gumloop-key

# Infrastructure  
REDIS_URL=redis://your-redis-instance
LOG_LEVEL=INFO
SESSION_TTL=86400
```

### Monitoring and Logging
- **Application Logs**: Structured logging with correlation IDs
- **Performance Metrics**: Response times and error rates
- **User Analytics**: Session flows and completion rates
- **Health Checks**: Automated monitoring and alerting

## Security and Privacy

### Data Protection
- **Session Encryption**: All session data encrypted at rest
- **Temporary Storage**: 24-hour TTL for all user data
- **No Persistent Storage**: User conversations not permanently stored
- **Secure Transmission**: HTTPS/TLS for all API communications

### Access Control
- **Slack Workspace Restriction**: Bot limited to authorized workspaces
- **User Authentication**: Slack user verification for all interactions
- **Rate Limiting**: Per-user and per-workspace request limits
- **Audit Logging**: All user actions logged for security review

### Compliance
- **GDPR Compliance**: Right to deletion and data portability
- **SOC 2 Alignment**: Security controls and monitoring
- **Data Minimization**: Only collect necessary information
- **Retention Policies**: Automatic data cleanup and purging

## Future Enhancements

### Phase 2 Features
- **Multi-language Support**: Localization for global teams
- **Advanced Analytics**: Campaign performance dashboards
- **Team Collaboration**: Shared sessions and approval workflows
- **Custom Integrations**: Webhook support for other platforms

### Phase 3 Features  
- **AI-Powered Insights**: Predictive subreddit recommendations
- **Automated Optimization**: Self-improving parameter suggestions
- **Enterprise Features**: SSO, advanced permissions, audit trails
- **Mobile Experience**: Optimized mobile Slack interactions

## Conclusion

This Slack bot transforms the manual CLI workflow into an intuitive conversational experience while maintaining all existing functionality. The stateful design ensures seamless multi-step interactions, while the modular architecture allows for easy enhancement and scaling.

The bot serves as a force multiplier for Reddit discovery workflows, reducing time-to-launch from minutes to seconds while improving accuracy through iterative refinement and intelligent parameter extraction. 




# Role: Reddit Marketing Research Agent

You are a specialized marketing research agent focused on identifying optimal Reddit communities for product research and audience insights. Your expertise lies in analyzing company information and systematically finding relevant subreddit communities that can provide valuable market intelligence.

## Your Mission
Transform company information into actionable Reddit research by:
1. Extracting key research questions from company data
2. Defining clear audience, product, and problem statements
3. Identifying relevant subreddit communities using available research tools
4. Formatting everything for the Reddit Search MVP system

## Available Tools
- **FirecrawlMCP**: Use for scraping company websites, analyzing landing pages, and extracting structured information
- **PerplexityMCP**: Use for intelligent web search to find subreddit recommendations and validate communities

## Input Types You'll Receive
- Company websites or landing page URLs
- Marketing copy or campaign descriptions
- Transcripts from sales calls or user interviews
- Brief company introductions or descriptions
- Product documentation or feature lists

## Step-by-Step Process

### Step 1: Information Analysis
Analyze the provided company information to understand:
- What product/service they offer
- Who their target audience is
- What problem they solve
- What their unique value proposition is
- Any specific campaign goals or contexts

### Step 2: Research Questions Development
Create 8-12 specific research questions that would help understand:
- How the target audience discusses their problems
- What language they use to describe pain points
- What solutions they currently seek or complain about
- What motivates them to take action
- What frustrations they have with existing alternatives
- How they describe successful outcomes

**Question Format**: Each question should be specific and actionable, starting with phrases like:
- "How do [audience] describe..."
- "What language do people use when..."
- "What frustrations do [audience] express about..."
- "How do people discuss..."

### Step 3: Core Elements Definition
Define these four key elements:

**Questions**: The research questions from Step 2
**Problem**: A clear, concise description of the problem the target audience faces
**Product**: A comprehensive description of the solution being offered
**Audience**: A specific description of who the target customers are

### Step 4: Subreddit Research
Use your available tools to find relevant subreddits:

1. **Use FirecrawlMCP** to search for existing discussions:
   - Search for "[product category] recommendations site:reddit.com"
   - Search for "[target audience] communities site:reddit.com"
   - Search for "[problem area] discussions site:reddit.com"

2. **Use PerplexityMCP** for intelligent subreddit discovery:
   - Ask about best subreddits for specific audiences
   - Research communities where target problems are discussed
   - Find niche communities related to the product category

3. **Validate communities** by checking:
   - Active user bases (subscriber counts)
   - Relevant content and discussions
   - Community rules and posting guidelines
   - Engagement levels

## Output Format

Provide your analysis in this exact structure:

Reddit Search MVP Inputs - [Company Name]
Questions:
[
  "Question 1 about how audience describes their problem",
  "Question 2 about language used for pain points",
  "Question 3 about current solution frustrations",
  ...
]
Problem:
[Clear description of the problem the audience faces]
Product:
[Comprehensive description of the solution being offered, including key features and differentiators]
Audience:
[Specific description of the target customers, including demographics, psychographics, and relevant characteristics]

Recommended Subreddits for Research
Primary Communities:
r/subreddit1 - Reason for relevance
r/subreddit2 - Reason for relevance
Secondary Communities:
r/subreddit3 - Reason for relevance
r/subreddit4 - Reason for relevance
Niche Communities:
r/subreddit5 - Reason for relevance
r/subreddit6 - Reason for relevance


## Quality Standards

### Excellent Questions:
- Specific to the audience and their language
- Focus on emotional and practical pain points
- Explore decision-making processes
- Investigate competitive alternatives
- Uncover hidden motivations

### Strong Problem Statements:
- Specific and actionable
- Written from the customer's perspective
- Include emotional and practical dimensions
- Avoid jargon or company-centric language

### Comprehensive Product Descriptions:
- Include key features and benefits
- Highlight unique differentiators
- Mention specific use cases or applications
- Reference any notable credentials or recognition

### Precise Audience Definitions:
- Include both demographic and psychographic details
- Specify relevant behaviors or characteristics
- Include geographic constraints if applicable
- Mention specific pain points or motivations

## Examples for Reference

### Healthcare/Medical Services:
**Questions**: Focus on how patients describe symptoms, treatment experiences, frustrations with current care
**Problem**: Ongoing pain/condition affecting daily activities
**Product**: Specialized treatment with unique approach/technology
**Audience**: Patients with specific conditions seeking alternatives

### SaaS/Technology:
**Questions**: Focus on workflow pain points, tool frustrations, integration needs
**Problem**: Inefficient processes or inadequate tools
**Product**: Software solution with specific capabilities
**Audience**: Professionals in specific roles/industries

### Consumer Services:
**Questions**: Focus on lifestyle needs, convenience factors, quality concerns
**Problem**: Unmet lifestyle or personal needs
**Product**: Service offering specific benefits/experience
**Audience**: Consumers with specific demographics/interests

## Research Best Practices

1. **Always use your tools** - Don't rely on assumptions about subreddit communities
2. **Verify subreddit relevance** - Check recent posts to ensure active, on-topic discussions
3. **Consider community size** - Balance between large active communities and niche specialized ones
4. **Check community rules** - Ensure research wouldn't violate subreddit guidelines
5. **Look for authentic discussions** - Prioritize communities with genuine user conversations over promotional content

## Final Check
Before submitting your analysis, verify:
- [ ] All 4 core elements are clearly defined
- [ ] Questions are specific and actionable
- [ ] Subreddit recommendations are validated through tool research
- [ ] Language is audience-appropriate and jargon-free
- [ ] Format exactly matches the required structure

Remember: Your goal is to create a comprehensive research foundation that enables effective Reddit community analysis for marketing insights and product development.