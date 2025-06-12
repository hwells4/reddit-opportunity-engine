# Reddit Opportunity Engine

*Automatically synced with your [v0.dev](https://v0.dev) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/hwells4s-projects/v0-reddit-opportunity-engine)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.dev-black?style=for-the-badge)](https://v0.dev/chat/projects/SU05g0kSZlV)

## Overview

This repository will stay in sync with your deployed chats on [v0.dev](https://v0.dev).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.dev](https://v0.dev).

## Deployment

Your project is live at:

**[https://vercel.com/hwells4s-projects/v0-reddit-opportunity-engine](https://vercel.com/hwells4s-projects/v0-reddit-opportunity-engine)**

## Build your app

Continue building your app on:

**[https://v0.dev/chat/projects/SU05g0kSZlV](https://v0.dev/chat/projects/SU05g0kSZlV)**

## How It Works

1. Create and modify your project using [v0.dev](https://v0.dev)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

## Notion Integration with Template Support

The `/api/add-to-notion` endpoint now supports using Notion templates for consistent branding and formatting.

### Template Usage

**Step 1: Create Templates in Notion**
1. Create a parent page template in Notion with your desired branding/structure
2. Create child page templates for strategy and comprehensive reports
3. Copy the page IDs from the URLs (the 32-character string after the last slash)

**Step 2: Use Templates in API Calls**
```json
{
  "strategyReport": "# Your markdown content...",
  "comprehensiveReport": "# Your markdown content...",
  "subreddit": "entrepreneurship",
  "email": "client@example.com",
  "runId": "run-123",
  "parentTemplateId": "abc123def456...",
  "strategyTemplateId": "def456ghi789...",
  "comprehensiveTemplateId": "ghi789jkl012..."
}
```

**Benefits:**
- ✅ Edit templates directly in Notion's visual interface
- ✅ Consistent branding across all reports
- ✅ Template structure + dynamic content
- ✅ Falls back to programmatic creation if no template provided