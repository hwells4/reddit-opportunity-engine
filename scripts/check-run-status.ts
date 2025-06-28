#!/usr/bin/env npx tsx

import chalk from 'chalk'

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000'

async function checkRunStatus(runId: string) {
  try {
    console.log(chalk.cyan(`\n🔍 Checking status for run: ${runId}\n`))
    
    // Fetch run details
    const response = await fetch(`${API_BASE}/api/runs?run_id=${runId}`)
    
    if (!response.ok) {
      console.log(chalk.red('❌ Failed to fetch run details'))
      return
    }
    
    const data = await response.json()
    const run = data.run_stats
    
    if (!run) {
      console.log(chalk.red('❌ Run not found'))
      return
    }
    
    // Display run info
    console.log(chalk.green('📊 Run Information:'))
    console.log(chalk.gray(`   Status: ${run.status}`))
    console.log(chalk.gray(`   Created: ${new Date(run.start_time).toLocaleString()}`))
    console.log(chalk.gray(`   Posts Analyzed: ${run.posts_analyzed_count || 0}`))
    console.log(chalk.gray(`   Quotes Extracted: ${run.quotes_extracted_count || 0}`))
    
    if (run.user_question) {
      console.log(chalk.gray(`   Question: ${run.user_question}`))
    }
    
    if (run.product_name) {
      console.log(chalk.gray(`   Product: ${run.product_name}`))
    }
    
    if (run.subreddits && run.subreddits.length > 0) {
      console.log(chalk.gray(`   Subreddits: ${run.subreddits.join(', ')}`))
    }
    
    // Check quote breakdown
    if (run.category_breakdown) {
      console.log(chalk.cyan('\n📈 Quote Categories:'))
      Object.entries(run.category_breakdown).forEach(([category, count]) => {
        console.log(chalk.gray(`   ${category}: ${count}`))
      })
    }
    
    // Check if run needs processing
    if (run.status === 'running' && run.posts_analyzed_count === 0) {
      console.log(chalk.yellow('\n⚠️  This run appears to be stuck - no posts have been processed'))
      console.log(chalk.yellow('    The webhook may need to be manually reconstructed and resent'))
    } else if (run.status === 'completed') {
      console.log(chalk.green('\n✅ Run completed successfully'))
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Error checking run status:'), error)
  }
}

// Get run ID from command line
const runId = process.argv[2]

if (!runId) {
  console.log(chalk.red('Usage: npm run check-run <run-id>'))
  process.exit(1)
}

checkRunStatus(runId)