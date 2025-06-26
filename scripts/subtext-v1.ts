#!/usr/bin/env tsx

/**
 * Subtext v1 - Enhanced Reddit Discovery CLI
 * 
 * Uses the new modular TypeScript discovery system with:
 * - Agentic AI queries (Perplexity + Firecrawl)
 * - Real Reddit validation with subscriber counts
 * - Human-in-the-loop subreddit selection
 * - Integration with Gumloop webhook
 */

import * as readline from 'readline'
import chalk from 'chalk'
import fetch from 'node-fetch'

interface SubredditCandidate {
  name: string
  subscribers: number
  description: string
  is_active: boolean
  over_18: boolean
  validation_status: string
}

interface DiscoveryRequest {
  audience: string
  problem: string
  product: string
  questions?: string
}

interface Account {
  account_id: string
  display_name: string
  company_name: string
  contact_name: string
  email: string
  website_url?: string
  created_date: string
}

interface CreateAccountRequest {
  company_name: string
  contact_name: string
  email: string
  website_url?: string
  company_description?: string
  industry?: string
}

interface GumloopWebhookPayload {
  user_id: string
  saved_item_id: string
  pipeline_inputs: Array<{
    input_name: string
    value: string
  }>
}

const API_BASE = process.env.API_BASE_URL || 'https://reddit-opportunity-engine-production.up.railway.app'

// CLI utilities
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function ask(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve))
}

function displayBanner() {
  console.log(chalk.cyan('┌─────────────────────────────────────────┐'))
  console.log(chalk.cyan('│') + chalk.bold.white('          Subtext v1.0                  ') + chalk.cyan('│'))
  console.log(chalk.cyan('│') + chalk.gray('   Enhanced Reddit Discovery Engine     ') + chalk.cyan('│'))
  console.log(chalk.cyan('└─────────────────────────────────────────┘'))
  console.log()
}

function displaySection(title: string) {
  console.log()
  console.log(chalk.blue('═'.repeat(50)))
  console.log(chalk.bold.blue(`  ${title}`))
  console.log(chalk.blue('═'.repeat(50)))
  console.log()
}

function displayRecommendationReasoning(recommendations: any) {
  console.log(chalk.yellow('🧠 Audience Research Analysis:'))
  console.log(chalk.gray('   (Focus: Where your audience discusses problems, NOT product promotion)'))
  console.log()
  
  // Show top 3 primary recommendations with reasoning
  const topPrimary = recommendations.primary.slice(0, 3)
  if (topPrimary.length > 0) {
    console.log(chalk.bold.green('🎯 Primary Communities (Exact Audience + Problem Match):'))
    topPrimary.forEach((rec: any, index: number) => {
      console.log(chalk.cyan(`${index + 1}. r/${rec.name}`))
      console.log(chalk.gray(`   Relevance: ${rec.relevance_score}/10`))
      console.log(chalk.gray(`   Why: ${rec.relevance_reason}`))
      if (rec.engagement_approach) {
        console.log(chalk.gray(`   Research Strategy: ${rec.engagement_approach}`))
      }
      console.log()
    })
  }
  
  // Show top 2 secondary if no primary or to supplement
  const topSecondary = recommendations.secondary.slice(0, 2)
  if (topSecondary.length > 0 && topPrimary.length < 3) {
    console.log(chalk.bold.blue('🔄 Secondary Communities (Adjacent/Broader):'))
    topSecondary.forEach((rec: any, index: number) => {
      console.log(chalk.cyan(`${index + 1}. r/${rec.name}`))
      console.log(chalk.gray(`   Relevance: ${rec.relevance_score}/10`))
      console.log(chalk.gray(`   Why: ${rec.relevance_reason}`))
      console.log()
    })
  }
  
  if (topPrimary.length === 0 && topSecondary.length === 0) {
    console.log(chalk.red('⚠️ No highly relevant communities found. Consider refining your audience/problem definition.'))
    console.log(chalk.gray('   The system prioritizes audience-specific communities over generic business/marketing subreddits.'))
  }
}

async function selectOrCreateAccount(): Promise<Account> {
  displaySection('Account Selection')
  
  console.log(chalk.yellow('Select an existing account or create a new one:'))
  console.log(chalk.gray('1. Search existing accounts'))
  console.log(chalk.gray('2. Create new account'))
  console.log(chalk.gray('3. Use recent accounts'))
  console.log()
  
  const choice = await ask(chalk.cyan('Choose option (1-3): '))
  
  switch (choice.trim()) {
    case '1':
      return await searchAndSelectAccount()
    case '2':
      return await createNewAccount()
    case '3':
      return await selectFromRecentAccounts()
    default:
      console.log(chalk.yellow('Invalid choice. Showing recent accounts...'))
      return await selectFromRecentAccounts()
  }
}

async function searchAndSelectAccount(): Promise<Account> {
  console.log()
  const searchQuery = await ask(chalk.cyan('Search by company name, contact name, or email: '))
  
  if (!searchQuery.trim()) {
    console.log(chalk.yellow('No search query provided. Showing recent accounts...'))
    return await selectFromRecentAccounts()
  }
  
  try {
    console.log(chalk.blue('🔍 Searching accounts...'))
    
    const response = await fetch(`${API_BASE}/api/accounts/search?q=${encodeURIComponent(searchQuery)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`)
    }
    
    const results = await response.json() as { accounts: Account[] }
    
    if (results.accounts.length === 0) {
      console.log(chalk.yellow('No accounts found. Would you like to create a new account?'))
      const createNew = await ask(chalk.cyan('Create new account? (y/n): '))
      if (createNew.toLowerCase() === 'y') {
        return await createNewAccount()
      } else {
        return await selectFromRecentAccounts()
      }
    }
    
    return await displayAccountsForSelection(results.accounts, 'Search Results')
    
  } catch (error) {
    console.log(chalk.red('❌ Search failed:'), error instanceof Error ? error.message : 'Unknown error')
    console.log(chalk.yellow('Falling back to recent accounts...'))
    return await selectFromRecentAccounts()
  }
}

async function selectFromRecentAccounts(): Promise<Account> {
  try {
    console.log(chalk.blue('📋 Loading recent accounts...'))
    
    const response = await fetch(`${API_BASE}/api/accounts/search?limit=10`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to load accounts: ${response.statusText}`)
    }
    
    const results = await response.json() as { accounts: Account[] }
    
    if (results.accounts.length === 0) {
      console.log(chalk.yellow('No existing accounts found. Creating new account...'))
      return await createNewAccount()
    }
    
    return await displayAccountsForSelection(results.accounts, 'Recent Accounts')
    
  } catch (error) {
    console.log(chalk.red('❌ Failed to load accounts:'), error instanceof Error ? error.message : 'Unknown error')
    console.log(chalk.yellow('Creating new account...'))
    return await createNewAccount()
  }
}

async function displayAccountsForSelection(accounts: Account[], title: string): Promise<Account> {
  console.log()
  console.log(chalk.bold.blue(`${title}:`))
  console.log()
  
  accounts.forEach((account, index) => {
    console.log(`${chalk.gray(`${index + 1}.`)} ${chalk.cyan(account.display_name)}`)  
    console.log(chalk.gray(`   Email: ${account.email}`))
    if (account.website_url) {
      console.log(chalk.gray(`   Website: ${account.website_url}`))
    }
    console.log(chalk.gray(`   Created: ${account.created_date}`))
    console.log()
  })
  
  console.log(`${chalk.gray(`${accounts.length + 1}.`)} ${chalk.green('Create new account')}`)
  console.log()
  
  const selection = await ask(chalk.cyan(`Select account (1-${accounts.length + 1}): `))
  
  try {
    const index = parseInt(selection.trim()) - 1
    
    if (index === accounts.length) {
      // Create new account option
      return await createNewAccount()
    }
    
    if (index >= 0 && index < accounts.length) {
      const selectedAccount = accounts[index]
      console.log(chalk.green(`✅ Selected: ${selectedAccount.display_name}`))
      return selectedAccount
    } else {
      console.log(chalk.yellow('Invalid selection. Using first account.'))
      return accounts[0]
    }
    
  } catch (error) {
    console.log(chalk.yellow('Invalid selection. Using first account.'))
    return accounts[0]
  }
}

async function createNewAccount(): Promise<Account> {
  console.log()
  console.log(chalk.bold.blue('Create New Account'))
  console.log(chalk.gray('Enter the following information:'))
  console.log()
  
  const companyName = await ask(chalk.cyan('Company name: '))
  const contactName = await ask(chalk.cyan('Contact name: '))
  const email = await ask(chalk.cyan('Email address: '))
  const websiteUrl = await ask(chalk.cyan('Website URL (optional): '))
  const industry = await ask(chalk.cyan('Industry (optional): '))
  const description = await ask(chalk.cyan('Brief company description (optional): '))
  
  const accountData: CreateAccountRequest = {
    company_name: companyName.trim(),
    contact_name: contactName.trim(),
    email: email.trim(),
    website_url: websiteUrl.trim() || undefined,
    industry: industry.trim() || undefined,
    company_description: description.trim() || undefined
  }
  
  // Validate required fields
  if (!accountData.company_name || !accountData.contact_name || !accountData.email) {
    console.log(chalk.red('❌ Missing required fields. Please try again.'))
    return await createNewAccount()
  }
  
  try {
    console.log(chalk.blue('🔄 Creating account...'))
    
    const response = await fetch(`${API_BASE}/api/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accountData)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error || response.statusText)
    }
    
    const result = await response.json() as { account: any }
    
    console.log(chalk.green('✅ Account created successfully!'))
    console.log(chalk.gray(`Account ID: ${result.account.account_id}`))
    
    // Format as Account interface
    const newAccount: Account = {
      account_id: result.account.account_id,
      display_name: `${result.account.company_name} (${result.account.contact_name})`,
      company_name: result.account.company_name,
      contact_name: result.account.contact_name,
      email: result.account.email,
      website_url: result.account.website_url,
      created_date: new Date(result.account.created_at).toLocaleDateString()
    }
    
    return newAccount
    
  } catch (error) {
    console.log(chalk.red('❌ Failed to create account:'), error instanceof Error ? error.message : 'Unknown error')
    console.log(chalk.yellow('Please try again.'))
    return await createNewAccount()
  }
}

async function collectUserInputs(): Promise<DiscoveryRequest> {
  displaySection('Discovery Parameters')
  
  console.log(chalk.yellow('Please provide information about your product and target audience:'))
  console.log()
  
  const product = await ask(chalk.cyan('What type of product are you building? ') + chalk.gray('(e.g., "SaaS Tool", "Mobile App") '))
  const problem = await ask(chalk.cyan('What problem does your product solve? ') + chalk.gray('(e.g., "Time management", "Data analysis") '))
  const audience = await ask(chalk.cyan('Who is your target audience? ') + chalk.gray('(e.g., "Startup founders", "Data scientists") '))
  const questions = await ask(chalk.cyan('What questions do they ask about this problem? ') + chalk.gray('(e.g., "How do I stay organized?", "What tools work best?") '))
  
  return {
    product: product.trim(),
    problem: problem.trim(), 
    audience: audience.trim(),
    questions: questions.trim() || undefined
  }
}

async function runDiscovery(request: DiscoveryRequest): Promise<SubredditCandidate[]> {
  displaySection('AI-Powered Discovery')
  
  console.log(chalk.yellow('🔍 Starting enhanced discovery with:'))
  console.log(chalk.gray(`  Product: ${request.product}`))
  console.log(chalk.gray(`  Problem: ${request.problem}`))
  console.log(chalk.gray(`  Audience: ${request.audience}`))
  console.log(chalk.gray(`  Questions: ${request.questions || 'None specified'}`))
  console.log()
  
  console.log(chalk.blue('🧠 Running agentic AI discovery...'))
  console.log(chalk.gray('  • Perplexity AI generating intelligent queries'))
  console.log(chalk.gray('  • Firecrawl searching Reddit discussions'))
  console.log(chalk.gray('  • Validating subreddits with real Reddit API'))
  console.log(chalk.gray('  • AI categorizing and scoring relevance'))
  console.log()
  
  try {
    const response = await fetch(`${API_BASE}/api/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(`Discovery failed: ${error.error || response.statusText}`)
    }
    
    const results = await response.json() as {
      total_subreddits_found: number
      recommendations: {
        primary: any[]
        secondary: any[]
        niche: any[]
      }
      validated_subreddits: any[]
    }
    
    console.log(chalk.green('✅ Discovery complete!'))
    console.log(chalk.gray(`  • Found ${results.total_subreddits_found} valid subreddits`))
    console.log(chalk.gray(`  • Primary: ${results.recommendations.primary.length}`))
    console.log(chalk.gray(`  • Secondary: ${results.recommendations.secondary.length}`))
    console.log(chalk.gray(`  • Niche: ${results.recommendations.niche.length}`))
    console.log()
    
    // Show AI reasoning for top recommendations
    displayRecommendationReasoning(results.recommendations)
    console.log()
    
    // Combine all recommendations into a flat list for selection
    const allCandidates: SubredditCandidate[] = []
    
    // Add primary (highest priority)
    results.recommendations.primary.forEach((rec: any) => {
      const validated = results.validated_subreddits.find((v: any) => v.name === rec.name)
      if (validated && validated.validation_status === 'valid') {
        allCandidates.push({
          ...validated,
          category: 'primary',
          relevance_score: rec.relevance_score,
          relevance_reason: rec.relevance_reason
        } as any)
      }
    })
    
    // Add secondary
    results.recommendations.secondary.forEach((rec: any) => {
      const validated = results.validated_subreddits.find((v: any) => v.name === rec.name)
      if (validated && validated.validation_status === 'valid') {
        allCandidates.push({
          ...validated,
          category: 'secondary',
          relevance_score: rec.relevance_score,
          relevance_reason: rec.relevance_reason
        } as any)
      }
    })
    
    // Add niche
    results.recommendations.niche.forEach((rec: any) => {
      const validated = results.validated_subreddits.find((v: any) => v.name === rec.name)
      if (validated && validated.validation_status === 'valid') {
        allCandidates.push({
          ...validated,
          category: 'niche',
          relevance_score: rec.relevance_score,
          relevance_reason: rec.relevance_reason
        } as any)
      }
    })
    
    return allCandidates
    
  } catch (error) {
    console.error(chalk.red('❌ Discovery failed:'), error instanceof Error ? error.message : 'Unknown error')
    throw error
  }
}

async function selectSubreddits(candidates: SubredditCandidate[]): Promise<SubredditCandidate[]> {
  displaySection('Human Selection')
  
  if (candidates.length === 0) {
    console.log(chalk.red('No valid candidates found. Exiting.'))
    return []
  }
  
  console.log(chalk.yellow(`Found ${candidates.length} subreddit candidates. Please select which ones to analyze:`))
  console.log()
  
  // Display candidates with categories
  let currentCategory = ''
  candidates.forEach((candidate, index) => {
    const category = (candidate as any).category || 'other'
    
    if (category !== currentCategory) {
      currentCategory = category
      console.log(chalk.bold.blue(`\n${category.toUpperCase()} COMMUNITIES:`))
    }
    
    const nameColor = candidate.over_18 ? chalk.red : chalk.cyan
    const subscribers = candidate.subscribers.toLocaleString()
    const relevanceScore = (candidate as any).relevance_score || 'N/A'
    
    console.log(`${chalk.gray(`${index + 1}.`)} ${nameColor(`r/${candidate.name}`)} ${chalk.gray(`(${subscribers} subscribers, score: ${relevanceScore})`)}`)
    console.log(chalk.gray(`   ${candidate.description.slice(0, 80)}...`))
  })
  
  console.log()
  console.log(chalk.yellow('Enter the numbers of subreddits to select (comma-separated, max 8):'))
  console.log(chalk.gray('Example: 1,3,5,7'))
  
  const selection = await ask(chalk.cyan('Selection: '))
  
  try {
    const indices = selection
      .split(',')
      .map(s => parseInt(s.trim()) - 1)
      .filter(i => i >= 0 && i < candidates.length)
      .slice(0, 8) // Max 8 selections
    
    if (indices.length === 0) {
      console.log(chalk.red('No valid selections made. Using top 5 candidates.'))
      return candidates.slice(0, 5)
    }
    
    const selected = indices.map(i => candidates[i])
    
    console.log()
    console.log(chalk.green(`✅ Selected ${selected.length} subreddits:`))
    selected.forEach(sub => {
      console.log(chalk.gray(`  • r/${sub.name} (${sub.subscribers.toLocaleString()} subscribers)`))
    })
    
    return selected
    
  } catch (error) {
    console.log(chalk.red('Invalid selection. Using top 5 candidates.'))
    return candidates.slice(0, 5)
  }
}

async function addManualSubreddits(currentSelection: SubredditCandidate[]): Promise<SubredditCandidate[]> {
  console.log()
  console.log(chalk.yellow('Would you like to add any additional subreddits manually?'))
  console.log(chalk.gray('Enter subreddit names separated by commas (without "r/"), or press Enter to skip:'))
  
  const manualInput = await ask(chalk.cyan('Additional subreddits: '))
  
  if (!manualInput.trim()) {
    return currentSelection
  }
  
  // Parse comma-separated subreddit names
  const subredditNames = manualInput
    .split(',')
    .map(name => name.trim().replace(/^r\//, ''))
    .filter(name => name.length > 0)
  
  if (subredditNames.length === 0) {
    return currentSelection
  }
  
  console.log(chalk.blue(`🔍 Validating ${subredditNames.length} additional subreddits...`))
  
  try {
    // Validate the manually entered subreddits
    const response = await fetch(`${API_BASE}/api/discover/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subreddit_names: subredditNames })
    })
    
    if (!response.ok) {
      console.log(chalk.red('❌ Failed to validate manual subreddits'))
      return currentSelection
    }
    
    const validationResults = await response.json() as { validated_subreddits: any[] }
    const validManualSubs = validationResults.validated_subreddits
      .filter((sub: any) => sub.validation_status === 'valid')
      .map((sub: any) => ({
        name: sub.name,
        subscribers: sub.subscribers,
        description: sub.description,
        is_active: sub.is_active,
        over_18: sub.over_18,
        validation_status: sub.validation_status,
        category: 'manual' as const,
        relevance_score: 8, // Give manual entries high relevance
        relevance_reason: 'Manually selected by user'
      }))
    
    const invalidCount = subredditNames.length - validManualSubs.length
    
    if (validManualSubs.length > 0) {
      console.log(chalk.green(`✅ Added ${validManualSubs.length} valid subreddits:`))
      validManualSubs.forEach((sub: any) => {
        console.log(chalk.gray(`  • r/${sub.name} (${sub.subscribers.toLocaleString()} subscribers)`))
      })
    }
    
    if (invalidCount > 0) {
      console.log(chalk.yellow(`⚠️ ${invalidCount} subreddits were invalid or private`))
    }
    
    return [...currentSelection, ...validManualSubs]
    
  } catch (error) {
    console.log(chalk.red('❌ Error validating manual subreddits:', error instanceof Error ? error.message : 'Unknown error'))
    return currentSelection
  }
}

async function collectAnalysisParams(account: Account): Promise<{ email: string, postLimit: string }> {
  displaySection('Analysis Configuration')
  
  console.log(chalk.gray(`Account: ${account.display_name}`))
  console.log()
  
  const email = await ask(chalk.cyan(`Email address for results [${account.email}]: `)) || account.email
  
  console.log(chalk.yellow('How many posts to analyze per subreddit?'))
  console.log(chalk.gray('  • 25: Quick analysis (~5 min)'))
  console.log(chalk.gray('  • 75: Standard analysis (~15 min)'))
  console.log(chalk.gray('  • 150: Deep analysis (~30 min)'))
  
  const postLimit = await ask(chalk.cyan('Post limit [75]: ')) || '75'
  
  return { email: email.trim(), postLimit: postLimit.trim() }
}

function extractProductName(product: string): string {
  // Simple pattern matching for product names
  const patterns = [
    /(?:called|named|is|called)\s+([A-Za-z0-9\s]+?)(?:\s|$|,|\.)/i,
    /^([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)*)\s+(?:is|that|which)/i,
    /^([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*)/,
    /([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*)\s+(?:tool|app|platform|service|software|solution)/i
  ]
  
  for (const pattern of patterns) {
    const match = product.match(pattern)
    if (match && match[1] && match[1].trim().length > 2) {
      return match[1].trim()
    }
  }
  
  return 'Subtext v1 Discovery'
}

async function createRun(request: DiscoveryRequest, account: Account): Promise<string> {
  try {
    const productName = extractProductName(request.product)
    
    const response = await fetch(`${API_BASE}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_question: `Find Reddit communities for ${request.product} targeting ${request.audience}`,
        problem_area: request.problem,
        target_audience: request.audience,
        product_type: request.product,
        product_name: productName,
        account_id: account.account_id
      })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to create run: ${response.statusText}`)
    }
    
    const data = await response.json() as { run_id: string }
    console.log(chalk.green(`🗃️ Created run: ${data.run_id}`))
    return data.run_id
    
  } catch (error) {
    console.log(chalk.yellow('⚠️ Failed to create run record, continuing without tracking...'))
    return ''
  }
}

async function sendToGumloop(
  selectedSubreddits: SubredditCandidate[],
  request: DiscoveryRequest,
  email: string,
  postLimit: string,
  runId: string,
  account: Account
): Promise<boolean> {
  displaySection('Gumloop Analysis')
  
  // Filter out any subreddits with zero or invalid subscribers
  const validSubreddits = selectedSubreddits.filter(sub => {
    if (!sub.subscribers || sub.subscribers <= 0) {
      console.log(chalk.yellow(`⚠️ Skipping r/${sub.name} - invalid subscriber count: ${sub.subscribers}`))
      return false
    }
    return true
  })
  
  if (validSubreddits.length === 0) {
    console.log(chalk.red('❌ No valid subreddits with positive subscriber counts found!'))
    return false
  }
  
  if (validSubreddits.length !== selectedSubreddits.length) {
    console.log(chalk.yellow(`⚠️ Filtered out ${selectedSubreddits.length - validSubreddits.length} subreddits with invalid subscriber counts`))
  }
  
  // Prepare subreddit data
  const subredditNames = validSubreddits.map(sub => sub.name)
  const subscriberCounts = validSubreddits.map(sub => sub.subscribers.toString())
  
  // Final validation - ensure arrays are exactly the same length
  if (subredditNames.length !== subscriberCounts.length) {
    console.log(chalk.red('❌ Critical error: Subreddit and subscriber arrays have different lengths!'))
    console.log(chalk.red(`   Subreddits: ${subredditNames.length}, Subscribers: ${subscriberCounts.length}`))
    return false
  }
  
  const payload: GumloopWebhookPayload = {
    user_id: process.env.GUMLOOP_USER_ID || 'EZUCg1VIYohJJgKgwDTrTyH2sC32',
    saved_item_id: process.env.GUMLOOP_SAVED_ITEM_ID || '2VJar3Dimtp46XZzXAzhEZ',
    pipeline_inputs: [
      { input_name: 'email', value: email },
      { input_name: 'subscribers', value: subscriberCounts.join(';') },
      { input_name: 'post_limit', value: postLimit },
      { input_name: 'name', value: account.company_name },
      { input_name: 'subreddits', value: subredditNames.join(';') },
      { input_name: 'audience', value: request.audience },
      { input_name: 'problem_area', value: request.problem },
      { input_name: 'product_type', value: request.product },
      { input_name: 'features', value: '' },
      { input_name: 'value_prop', value: '' },
      { input_name: 'context', value: request.questions || '' },
      { input_name: 'run_id', value: runId }
    ]
  }
  
  console.log(chalk.yellow('📋 Webhook payload preview:'))
  console.log(chalk.gray(JSON.stringify(payload, null, 2)))
  console.log()
  
  const confirmation = await ask(chalk.cyan('Send to Gumloop for analysis? (y/n/test/skip) [skip]: ')) || 'skip'
  
  if (confirmation.toLowerCase() === 'n') {
    console.log(chalk.yellow('❌ Analysis cancelled.'))
    return false
  }
  
  if (confirmation.toLowerCase() === 'skip') {
    console.log(chalk.green('✅ Discovery test completed successfully!'))
    console.log(chalk.yellow('Skipped Gumloop integration for testing purposes.'))
    return true
  }
  
  if (confirmation.toLowerCase() === 'test') {
    console.log(chalk.green('✅ Test completed successfully!'))
    console.log(chalk.yellow('This was a test run. No actual analysis was triggered.'))
    return true
  }
  
  // Send actual request through Railway proxy
  try {
    console.log(chalk.blue('🚀 Sending to Gumloop via Railway...'))
    
    const response = await fetch(`${API_BASE}/api/start-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.log(chalk.red(`❌ Gumloop API error ${response.status}: ${error}`))
      return false
    }
    
    const result = await response.json() as { run_id?: string; url?: string }
    console.log(chalk.green('✅ Successfully started Gumloop analysis!'))
    console.log(chalk.gray(`Run ID: ${result.run_id || 'N/A'}`))
    console.log(chalk.gray(`Tracking URL: ${result.url || 'N/A'}`))
    
    return true
    
  } catch (error) {
    console.log(chalk.red('❌ Failed to send to Gumloop:'), error instanceof Error ? error.message : 'Unknown error')
    return false
  }
}

async function main() {
  try {
    displayBanner()
    
    // Step 1: Select or create account
    const account = await selectOrCreateAccount()
    
    // Step 2: Collect user inputs
    const request = await collectUserInputs()
    
    // Step 3: Create run record
    const runId = await createRun(request, account)
    
    // Step 4: Run AI discovery
    const candidates = await runDiscovery(request)
    
    if (candidates.length === 0) {
      console.log(chalk.red('❌ No valid subreddits found. Exiting.'))
      process.exit(1)
    }
    
    // Step 5: Human selection
    let selectedSubreddits = await selectSubreddits(candidates)
    
    if (selectedSubreddits.length === 0) {
      console.log(chalk.red('❌ No subreddits selected. Exiting.'))
      process.exit(1)
    }
    
    // Step 5.5: Manual additions
    selectedSubreddits = await addManualSubreddits(selectedSubreddits)
    
    // Step 6: Analysis configuration
    const { email, postLimit } = await collectAnalysisParams(account)
    
    // Step 7: Send to Gumloop
    const success = await sendToGumloop(selectedSubreddits, request, email, postLimit, runId, account)
    
    // Final summary
    console.log()
    console.log(chalk.blue('═'.repeat(50)))
    console.log(chalk.bold.green('🎉 Subtext v1 Complete!'))
    console.log()
    
    if (success) {
      console.log(chalk.green('✅ Analysis started successfully'))
      console.log(chalk.gray(`📧 Results will be sent to: ${email}`))
      console.log(chalk.gray(`📊 Analyzing ${selectedSubreddits.length} subreddits with ${postLimit} posts each`))
    } else {
      console.log(chalk.yellow('⚠️ Analysis was not started'))
    }
    
    console.log(chalk.blue('═'.repeat(50)))
    
  } catch (error) {
    console.error(chalk.red('💥 Fatal error:'), error instanceof Error ? error.message : 'Unknown error')
    process.exit(1)
  } finally {
    rl.close()
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Goodbye!'))
  rl.close()
  process.exit(0)
})

// Run the script
if (require.main === module) {
  main()
}

export { main }