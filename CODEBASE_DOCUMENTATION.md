# Reddit Opportunity Engine - Comprehensive Documentation

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Frontend Components](#frontend-components)
4. [Backend Services](#backend-services)
5. [Reddit Discovery Engine](#reddit-discovery-engine)
6. [API Integration](#api-integration)
7. [Deployment & Infrastructure](#deployment--infrastructure)
8. [Development Workflow](#development-workflow)

---

## 🎯 Project Overview

**Reddit Opportunity Engine** is a Next.js application that helps entrepreneurs and marketers discover profitable product opportunities by analyzing authentic conversations in Reddit communities. The platform transforms real user discussions into actionable business insights, providing MVP roadmaps, audience profiles, and market validation.

### Key Value Propositions
- **Authentic Market Research**: Analyzes genuine user problems and frustrations from Reddit discussions
- **AI-Powered Discovery**: Uses multiple AI models (Claude 4 Sonnet, OpenAI o3, Perplexity) to find relevant communities
- **Automated Report Generation**: Creates comprehensive strategy reports and Notion deliverables
- **Multi-Platform Analysis**: Enhanced discovery across various Reddit communities

---

## 🏗️ System Architecture

### Technology Stack
- **Frontend**: Next.js 15.2.4 with React 19, TypeScript
- **UI Framework**: Tailwind CSS with Radix UI components
- **Styling**: Neo-brutalism design system with custom animations
- **Backend**: Next.js API routes
- **AI Services**: OpenRouter, Perplexity AI, Claude 4 Sonnet
- **External APIs**: Gumloop, Notion API, Reddit API
- **Deployment**: Vercel (frontend) + Railway (backend services)

### Architecture Patterns
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │────│   Next.js APIs   │────│  External APIs  │
│   (Next.js)     │    │   (Route Handlers)│    │  (Gumloop, etc.)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   UI Components │    │  Reddit Discovery│    │   Notion API    │
│   (Radix UI)    │    │     Agent        │    │  (Report Gen)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

---

## 🎨 Frontend Components

### Core Components

#### `app/page.tsx` - Homepage
- **Purpose**: Main landing page with hero section and form
- **Features**: 
  - Bold neo-brutalism design with black borders and shadows
  - Reddit value proposition messaging
  - Call-to-action flow to Reddit analyzer form
- **Key Elements**: Header, hero section, "Why Reddit" explanation, pricing, CTA

#### `components/reddit-analyzer-form.tsx` - Main Form
- **Purpose**: Primary user interaction component for starting analysis
- **Features**:
  - Real-time subreddit validation with Reddit API
  - Enhanced AI discovery toggle (default enabled)
  - Form state management with React Hook Form
  - Visual feedback with loading states and animations
- **Form Fields**:
  - `subreddit`: Target Reddit community (validated)
  - `focus`: Business focus area (optional)
  - `email`: User email for report delivery
  - `postLimit`: Number of posts to analyze (10-500)
  - `useEnhancedDiscovery`: Toggle for AI-powered vs basic analysis

#### `components/pricing-widget.tsx` - Pricing Display
- **Purpose**: Shows tiered pricing with progress slider
- **Features**:
  - Visual pricing slider with dots indicating current tier
  - Dynamic pricing based on user count milestones
  - Testimonial integration from founder
  - Clear value proposition for each tier

#### `components/success-dialog.tsx` - Completion Modal
- **Purpose**: Shows analysis completion and next steps
- **Features**:
  - Success confirmation with run ID
  - Links to generated reports
  - Professional presentation for user confidence

### UI Component System
- **Base Components**: Located in `components/ui/`
- **Framework**: Radix UI primitives with custom styling
- **Design System**: Neo-brutalism with black borders, bold shadows
- **Animations**: Framer Motion for form interactions and attention effects

---

## 🔧 Backend Services

### API Routes (`app/api/`)

#### `/api/enhanced-subreddit-discovery/route.ts`
- **Purpose**: Enhanced AI-powered subreddit discovery endpoint
- **Method**: POST
- **Input**:
  ```typescript
  {
    product_type: string;
    problem_area: string;
    target_audience: string;
    additional_context?: string;
  }
  ```
- **Output**: Categorized subreddit recommendations (Primary/Secondary/Niche)
- **Integration**: Calls Python enhanced discovery service at port 5001

#### `/api/start-pipeline/route.ts`
- **Purpose**: Triggers traditional Gumloop analysis pipeline
- **Method**: POST
- **Input**: `subreddit`, `focus`, `email`, `postLimit`
- **Integration**: Gumloop API for automated report generation
- **Response**: Returns `run_id` for tracking analysis progress

#### `/api/add-to-notion/route.ts`
- **Purpose**: Creates professional reports in Notion with branding
- **Method**: POST
- **Features**:
  - Template-based page creation with custom branding
  - Markdown parsing for rich content formatting
  - AI-powered title generation
  - Branded homepage with company banner
  - Hierarchical report structure (Parent → Homepage → Strategy/Comprehensive)
- **Key Functions**:
  - `createReportPageFromTemplate()`: Template-based page creation
  - `createBlocksFromMarkdown()`: Converts markdown to Notion blocks
  - `parseRichText()`: Handles text formatting (bold, italic, links, code)

#### `/api/check-status/route.ts` & `/api/inspect-database/route.ts`
- **Purpose**: Health checks and database inspection utilities
- **Usage**: Monitoring and debugging endpoints

---

## 🤖 Reddit Discovery Engine

### Enhanced Search Agent (`services/reddit_discovery_agent/`)

#### Core Architecture
```python
class EnhancedSearchAgent:
    def __init__(self, product_type, problem_area, target_audience, additional_context):
        # Multi-model AI configuration with fallbacks
        self.analysis_models = [
            "anthropic/claude-3-5-sonnet",  # Primary
            "openai/gpt-4-turbo",           # Fallback 1
            "openai/gpt-4o-mini",           # Fallback 2
            "anthropic/claude-3-haiku",     # Fallback 3
            "openai/gpt-3.5-turbo",         # Final fallback
        ]
```

#### Discovery Process Flow
1. **Perplexity AI Discovery**: Uses real-time web search to find relevant communities
2. **Firecrawl Search**: Comprehensive Reddit content analysis
3. **Subreddit Validation**: Verifies community existence and gathers metadata
4. **AI-Powered Analysis**: Categorizes communities and generates engagement strategies
5. **Final Recommendations**: Structured output with relevance scoring

#### Key Features
- **Multi-Source Discovery**: Perplexity + Firecrawl + AI analysis
- **Intelligent Fallbacks**: Graceful degradation when APIs fail
- **Community Validation**: Real-time Reddit API validation
- **Strategic Recommendations**: Tailored engagement approaches per community
- **Rich Output Format**: Categorized results with relevance scoring

### MVP Flow (`mvp_flow.py`)
- **Purpose**: Interactive CLI for enhanced discovery testing
- **Features**: Rich console interface with progress tracking
- **Integration**: Seamlessly switches between enhanced and traditional methods

---

## 🔗 API Integration

### External Service Integration

#### Gumloop API
- **Purpose**: Traditional Reddit analysis pipeline
- **Endpoints**: Pipeline execution and status tracking
- **Configuration**: Uses environment-specific `saved_item_id` for different workflows

#### Notion API
- **Purpose**: Professional report delivery and branding
- **Features**:
  - Dynamic database property mapping
  - Template-based page creation
  - Rich content formatting
  - Branded deliverables with custom banners

#### Reddit API
- **Purpose**: Real-time subreddit validation
- **Implementation**: Direct API calls with fallback validation
- **Data**: Subscriber counts, community descriptions, activity status

#### AI Service APIs
- **OpenRouter**: Primary AI model access (Claude, GPT models)
- **Perplexity**: Real-time Reddit community research
- **Firecrawl**: Comprehensive web content search

### Environment Configuration
```env
# Core API Keys
OPENROUTER_API_KEY=
PERPLEXITY_API_KEY=
FIRECRAWL_API_KEY=
NOTION_API_KEY=
GUMLOOP_API_KEY=

# Service URLs
ENHANCED_DISCOVERY_SERVICE_URL=http://localhost:5001
NOTION_DATABASE_ID=

# Deployment
RAILWAY_PUBLIC_DOMAIN=
VERCEL_URL=
```

---

## 🚀 Deployment & Infrastructure

### Frontend Deployment (Vercel)
- **Platform**: Vercel with automatic deployments from GitHub
- **Configuration**: `vercel.json` and Next.js config
- **Domain**: Production domain with custom branding

### Backend Services (Railway)
- **Reddit Discovery Agent**: Python service on Railway
- **Configuration**: `railway.json` for service deployment
- **Docker**: Containerized deployment with `Dockerfile`

### Development Environment
```bash
# Frontend Development
npm run dev                    # Start Next.js dev server
npm run build                  # Production build
npm run lint                   # Code linting

# Reddit Discovery Service
npm run reddit-search-mvp      # Enhanced discovery with CLI
cd services/reddit_discovery_agent && ./start_enhanced_service.sh
```

---

## 🔄 Development Workflow

### Component Development
1. **Design First**: Follow neo-brutalism design system
2. **Accessibility**: Use Radix UI primitives for a11y compliance
3. **Responsive**: Mobile-first responsive design
4. **Performance**: Optimize for Core Web Vitals

### API Development
1. **Type Safety**: Full TypeScript typing for API routes
2. **Error Handling**: Comprehensive error responses
3. **Validation**: Input validation with Zod schemas
4. **Documentation**: Clear API documentation with examples

### AI Integration Best Practices
1. **Fallback Models**: Always provide model fallbacks
2. **Rate Limiting**: Respect API rate limits with delays
3. **Error Recovery**: Graceful degradation when AI services fail
4. **Cost Optimization**: Use appropriate model sizes for tasks

### Testing Strategy
1. **Manual Testing**: Interactive MVP flow for discovery testing
2. **API Testing**: Direct API endpoint testing with curl/Postman
3. **Integration Testing**: End-to-end workflow validation
4. **Performance Testing**: Load testing for API endpoints

---

## 📊 Key Business Metrics

### User Journey Tracking
1. **Landing Page Engagement**: CTA clicks and form interactions
2. **Form Completion Rate**: Successful analysis starts
3. **Discovery Success Rate**: Valid subreddits found
4. **Report Generation**: Notion deliverable completion

### Technical Metrics
1. **API Response Times**: Enhanced discovery performance
2. **AI Model Success Rates**: Fallback utilization tracking
3. **Error Rates**: Service availability monitoring
4. **Cost Tracking**: AI API usage and expenses

---

## 🔮 Future Enhancements

### Planned Features
1. **Real-time Analysis Progress**: WebSocket-based progress updates
2. **Advanced Filtering**: Custom community filters and preferences
3. **Historical Analysis**: Trend analysis over time
4. **Competition Analysis**: Competitive landscape insights
5. **Automated Monitoring**: Ongoing community tracking

### Technical Improvements
1. **Caching Layer**: Redis-based caching for improved performance
2. **Database Integration**: Persistent storage for user analyses
3. **Advanced AI Models**: Integration with latest model releases
4. **Enhanced Analytics**: Detailed usage and performance analytics

---

This documentation provides a comprehensive overview of the Reddit Opportunity Engine codebase, covering both technical implementation details and business context. The system successfully combines modern web development practices with advanced AI capabilities to deliver a unique market research platform.