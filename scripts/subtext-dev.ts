#!/usr/bin/env tsx

import * as readline from 'readline/promises'
import chalk from 'chalk'

const API_BASE = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : "https://reddit-opportunity-engine-production.up.railway.app"

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

async function ask(question: string): Promise<string> {
  const answer = await rl.question(question)
  return answer.trim()
}

function displayBanner() {
  console.log(chalk.cyan(`
╔═══════════════════════════════════════╗
║            Subtext Dev                ║
║    Workflow & Webhook Management      ║
╚═══════════════════════════════════════╝
`))
}

function displayMainMenu() {
  console.log(chalk.cyan('\n🎯 What would you like to do?\n'))
  console.log('1. 🆕 Create a new Gumloop workflow')
  console.log('2. 🔄 Resend a failed webhook') 
  console.log('3. 🧪 A/B test webhook across multiple workflows')
  console.log('4. ❌ Exit')
}

// Workflow management
interface Workflow {
  workflow_id: string
  workflow_name: string
  workflow_url: string
  description?: string
  user_id?: string
  saved_item_id?: string
}

async function createWorkflow(): Promise<void> {
  console.log(chalk.yellow('\n🆕 Create New Gumloop Workflow\n'))
  
  const workflow_name = await ask('Workflow name (e.g. "Production v1", "New Experiment"): ')
  if (!workflow_name) {
    console.log(chalk.red('❌ Workflow name is required'))
    return
  }
  
  console.log(chalk.gray('\nPaste your Gumloop URL:'))
  console.log(chalk.gray('Example: https://api.gumloop.com/api/v1/start_pipeline?user_id=ABC123&saved_item_id=XYZ789'))
  
  const workflow_url = await ask('Gumloop URL: ')
  if (!workflow_url) {
    console.log(chalk.red('❌ Workflow URL is required'))
    return
  }
  
  // Validate URL format
  if (!workflow_url.includes('gumloop.com') || !workflow_url.includes('start_pipeline')) {
    console.log(chalk.yellow('⚠️  This doesn\'t look like a Gumloop URL. Continuing anyway...'))
  }
  
  const description = await ask('Description (optional): ')
  
  try {
    console.log(chalk.blue('\n💾 Saving workflow...'))
    
    const response = await fetch(`${API_BASE}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_name,
        workflow_url,
        description: description || undefined
      })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create workflow')
    }
    
    const workflow = await response.json()
    
    console.log(chalk.green('✅ Workflow created successfully!'))
    console.log(chalk.gray(`   ID: ${workflow.workflow_id}`))
    console.log(chalk.gray(`   Name: ${workflow.workflow_name}`))
    if (workflow.user_id) {
      console.log(chalk.gray(`   User ID: ${workflow.user_id}`))
    }
    if (workflow.saved_item_id) {
      console.log(chalk.gray(`   Saved Item ID: ${workflow.saved_item_id}`))
    }
    
  } catch (error: any) {
    console.log(chalk.red('❌ Error creating workflow:', error.message))
  }
}

async function fetchWorkflows(): Promise<Workflow[]> {
  try {
    const response = await fetch(`${API_BASE}/api/workflows`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch workflows: ${response.statusText}`)
    }
    
    return await response.json()
  } catch (error: any) {
    console.log(chalk.red('❌ Error fetching workflows:', error.message))
    return []
  }
}

async function fetchWebhookData(runId: string) {
  try {
    const response = await fetch(`${API_BASE}/api/webhooks/resend?run_id=${runId}`)
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch webhook data')
    }
    
    return await response.json()
  } catch (error: any) {
    throw new Error(error.message)
  }
}

async function displayWebhookSummary(data: any) {
  console.log(chalk.green('\n📋 Original Webhook Summary:'))
  console.log(chalk.gray(`   Run ID: ${data.run_id}`))
  console.log(chalk.gray(`   Sent: ${new Date(data.webhook_sent_at).toLocaleString()}`))
  
  if (data.webhook_payload.pipeline_inputs) {
    const inputs = data.webhook_payload.pipeline_inputs
    const subreddits = inputs.find((i: any) => i.input_name === 'subreddits')?.value || 'N/A'
    const postLimit = inputs.find((i: any) => i.input_name === 'post_limit')?.value || 'N/A'
    const email = inputs.find((i: any) => i.input_name === 'email')?.value || 'N/A'
    
    console.log(chalk.gray(`   Subreddits: ${subreddits.split(';').length} subreddits`))
    console.log(chalk.gray(`   Post limit: ${postLimit}`))
    console.log(chalk.gray(`   Email: ${email}`))
  }
}

async function resendWebhook(): Promise<void> {
  console.log(chalk.yellow('\n🔄 Resend Failed Webhook\n'))
  
  const runId = await ask('Enter run ID to resend: ')
  if (!runId) {
    console.log(chalk.red('❌ Run ID is required'))
    return
  }
  
  try {
    // Fetch original webhook data
    console.log(chalk.blue('🔍 Fetching original webhook...'))
    const webhookData = await fetchWebhookData(runId)
    
    // Display summary
    await displayWebhookSummary(webhookData)
    
    // Ask if they want to modify anything
    const modify = await ask('\nModify anything before resending? (y/n): ')
    
    let modifications = null
    let aiPrompt = null
    
    if (modify.toLowerCase() === 'y') {
      // Ask for modification method
      console.log(chalk.cyan('\nHow would you like to modify the webhook?'))
      console.log('1. 🤖 AI-powered natural language (e.g., "change subreddits to programming and webdev")')
      console.log('2. ⚙️  Direct field modifications (e.g., post_limit=100)')
      
      const modMethod = await ask('Choose method (1-2): ')
      
      if (modMethod === '1') {
        // AI-powered modifications
        console.log(chalk.yellow('\nDescribe your modifications in natural language:'))
        console.log(chalk.gray('Examples:'))
        console.log(chalk.gray('  - "Change subreddits to programming, webdev, and javascript"'))
        console.log(chalk.gray('  - "Reduce post limit to 50"'))
        console.log(chalk.gray('  - "Change email to john@company.com"'))
        
        const prompt = await ask('\nYour request: ')
        if (prompt.trim()) {
          aiPrompt = prompt.trim()
          console.log(chalk.green(`✓ Will use AI to: ${aiPrompt}`))
        }
      } else if (modMethod === '2') {
        // Direct field modifications
        console.log(chalk.yellow('\nEnter modifications (field_name=new_value, empty to finish):'))
        console.log(chalk.gray('Example: post_limit=100'))
        console.log(chalk.gray('Example: subreddits=programming;webdev'))
        console.log(chalk.cyan('💡 Subreddit changes are automatically validated with current subscriber counts'))
        
        const mods: any = { pipeline_inputs: [] }
        
        while (true) {
          const input = await ask('Modification: ')
          if (!input) break
          
          const [field, ...valueParts] = input.split('=')
          const value = valueParts.join('=')
          
          if (!field || !value) {
            console.log(chalk.red('Invalid format. Use: field_name=value'))
            continue
          }
          
          mods.pipeline_inputs.push({
            input_name: field.trim(),
            value: value.trim()
          })
          
          console.log(chalk.green(`✓ Will modify ${field} to "${value}"`))
        }
        
        modifications = mods.pipeline_inputs.length > 0 ? mods : null
      }
    }
    
    // Confirm and send
    const confirm = await ask('\n🚀 Proceed with resend? (y/n): ')
    if (confirm.toLowerCase() !== 'y') {
      console.log(chalk.yellow('Cancelled'))
      return
    }
    
    console.log(chalk.blue('📤 Resending webhook...'))
    
    const body: any = { run_id: runId }
    if (modifications) {
      body.modifications = modifications
    }
    if (aiPrompt) {
      body.ai_prompt = aiPrompt
    }
    
    const response = await fetch(`${API_BASE}/api/webhooks/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    
    const result = await response.json()
    
    if (!response.ok) {
      console.log(chalk.red('❌ Failed to resend webhook:'))
      console.log(chalk.red(result.error))
      return
    }
    
    console.log(chalk.green('✅ Webhook resent successfully!'))
    console.log(chalk.gray(`   New run ID: ${result.test_results?.[0]?.run_id || result.new_run_id}`))
    
    if (result.test_results?.[0]?.response?.tracking_url) {
      console.log(chalk.cyan(`   Tracking: ${result.test_results[0].response.tracking_url}`))
    }
    
  } catch (error: any) {
    console.log(chalk.red('❌ Error:', error.message))
  }
}

async function selectWorkflows(): Promise<Workflow[]> {
  const workflows = await fetchWorkflows()
  
  if (workflows.length === 0) {
    console.log(chalk.yellow('❌ No saved workflows found.'))
    console.log(chalk.gray('   Use option 1 to create workflows first.'))
    return []
  }
  
  console.log(chalk.cyan('\n📚 Available workflows:'))
  workflows.forEach((w, index) => {
    console.log(chalk.gray(`   ${index + 1}. ${w.workflow_name}`))
    if (w.description) {
      console.log(chalk.gray(`      ${w.description}`))
    }
  })
  
  const selected: Workflow[] = []
  
  while (true) {
    const choice = await ask(`\nSelect workflow (1-${workflows.length}, or 'done' to finish): `)
    
    if (choice.toLowerCase() === 'done') {
      break
    }
    
    const choiceNum = parseInt(choice)
    
    if (choiceNum >= 1 && choiceNum <= workflows.length) {
      const workflow = workflows[choiceNum - 1]
      if (!selected.find(w => w.workflow_id === workflow.workflow_id)) {
        selected.push(workflow)
        console.log(chalk.green(`✓ Added: ${workflow.workflow_name}`))
      } else {
        console.log(chalk.yellow(`Already selected: ${workflow.workflow_name}`))
      }
    } else {
      console.log(chalk.red('Invalid choice'))
    }
  }
  
  return selected
}

async function abTestWebhook(): Promise<void> {
  console.log(chalk.yellow('\n🧪 A/B Test Webhook Across Multiple Workflows\n'))
  
  const runId = await ask('Enter run ID to test: ')
  if (!runId) {
    console.log(chalk.red('❌ Run ID is required'))
    return
  }
  
  try {
    // Fetch original webhook data
    console.log(chalk.blue('🔍 Fetching original webhook...'))
    const webhookData = await fetchWebhookData(runId)
    
    // Display summary
    await displayWebhookSummary(webhookData)
    
    // Select workflows to test
    const workflows = await selectWorkflows()
    
    if (workflows.length === 0) {
      console.log(chalk.yellow('❌ No workflows selected'))
      return
    }
    
    console.log(chalk.cyan(`\n📊 Will test against ${workflows.length} workflows:`))
    workflows.forEach(w => console.log(chalk.gray(`   • ${w.workflow_name}`)))
    
    // Confirm and run test
    const confirm = await ask('\n🚀 Proceed with A/B test? (y/n): ')
    if (confirm.toLowerCase() !== 'y') {
      console.log(chalk.yellow('Cancelled'))
      return
    }
    
    console.log(chalk.blue('🧪 Running A/B test...'))
    
    const response = await fetch(`${API_BASE}/api/webhooks/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: runId,
        test_workflows: workflows
      })
    })
    
    const result = await response.json()
    
    if (!response.ok) {
      console.log(chalk.red('❌ A/B test failed:'))
      console.log(chalk.red(result.error))
      return
    }
    
    // Display results
    console.log(chalk.green('\n✅ A/B test complete!'))
    console.log(chalk.cyan(`📊 Results (${result.summary.successful}/${result.summary.total_workflows} successful):\n`))
    
    for (const test of result.test_results) {
      const status = test.success ? chalk.green('✅ SUCCESS') : chalk.red('❌ FAILED')
      console.log(`${status} - ${test.workflow_name}`)
      console.log(chalk.gray(`   Run ID: ${test.run_id}`))
      
      if (test.success && test.response.tracking_url) {
        console.log(chalk.cyan(`   Tracking: ${test.response.tracking_url}`))
      } else if (!test.success) {
        console.log(chalk.red(`   Error: ${test.error}`))
      }
      console.log()
    }
    
  } catch (error: any) {
    console.log(chalk.red('❌ Error:', error.message))
  }
}

async function main() {
  displayBanner()
  
  try {
    while (true) {
      displayMainMenu()
      const choice = await ask(chalk.cyan('\nChoose option (1-4): '))
      
      switch (choice.trim()) {
        case '1':
          await createWorkflow()
          break
        case '2':
          await resendWebhook()
          break
        case '3':
          await abTestWebhook()
          break
        case '4':
          console.log(chalk.green('\n👋 Goodbye!'))
          process.exit(0)
        default:
          console.log(chalk.red('❌ Invalid choice, please try again'))
      }
      
      console.log(chalk.cyan('\n───────────────────────────────────────'))
      const continueChoice = await ask(chalk.cyan('Press Enter to return to main menu, or type "exit" to quit: '))
      
      if (continueChoice.toLowerCase() === 'exit') {
        console.log(chalk.green('\n👋 Goodbye!'))
        break
      }
    }
  } catch (error: any) {
    console.log(chalk.red('\n❌ Error:'), error.message)
  } finally {
    rl.close()
  }
}

// Run the script
main().catch(console.error)