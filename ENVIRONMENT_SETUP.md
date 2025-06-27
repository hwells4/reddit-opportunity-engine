# Environment Variables Setup

## Required Environment Variables

Create a `.env` file in your project root with these variables:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://ojvdxjcziacptbcypexl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

# API Configuration
API_BASE_URL=http://localhost:3000

# Gumloop Configuration  
GUMLOOP_SAVED_ITEM_ID=96YEbP1uWuEtBKNsiraxN7
GUMLOOP_WEBHOOK_URL=http://localhost:3000/api/gumloop-data

# OpenRouter API Key (for MVP script)
OPENROUTER_API_KEY=your-openrouter-api-key
```

## How to Get Supabase Keys

1. Go to your Supabase dashboard
2. Navigate to Settings → API  
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Service Role Key** → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

## Production Deployment

For Railway/Vercel deployment, add these as environment variables in your deployment settings.

**Important**: Never commit the actual `.env` file to git! 