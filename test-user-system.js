#!/usr/bin/env node

/**
 * Test script for the new user account management system
 * Tests account creation, run association, and usage tracking
 */

const fetch = require('node-fetch');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

async function testAccountSystem() {
  console.log('🧪 Testing User Account Management System');
  console.log('='.repeat(50));

  try {
    // Test 1: Create a new account
    console.log('\n1. Creating test account...');
    const createAccountResponse = await fetch(`${API_BASE}/api/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name: 'Test Company Inc',
        contact_name: 'John Test',
        email: 'john@testcompany.com',
        website_url: 'https://testcompany.com',
        industry: 'Technology',
        company_description: 'A test company for the user management system'
      })
    });

    if (!createAccountResponse.ok) {
      const error = await createAccountResponse.json();
      throw new Error(`Account creation failed: ${error.error}`);
    }

    const createResult = await createAccountResponse.json();
    const accountId = createResult.account.account_id;
    console.log(`✅ Account created: ${accountId}`);
    console.log(`   Company: ${createResult.account.company_name}`);
    console.log(`   Contact: ${createResult.account.contact_name}`);

    // Test 2: Search for the account
    console.log('\n2. Testing account search...');
    const searchResponse = await fetch(`${API_BASE}/api/accounts/search?q=Test Company`);
    
    if (!searchResponse.ok) {
      throw new Error('Account search failed');
    }

    const searchResult = await searchResponse.json();
    console.log(`✅ Found ${searchResult.accounts.length} accounts matching "Test Company"`);
    
    const foundAccount = searchResult.accounts.find(acc => acc.account_id === accountId);
    if (foundAccount) {
      console.log(`   Found our account: ${foundAccount.display_name}`);
    } else {
      throw new Error('Created account not found in search results');
    }

    // Test 3: Create a run associated with the account
    console.log('\n3. Creating test run with account association...');
    const createRunResponse = await fetch(`${API_BASE}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_question: 'Test question for user system',
        problem_area: 'Testing',
        target_audience: 'Developers',
        product_type: 'Testing Framework',
        product_name: 'User System Test',
        account_id: accountId
      })
    });

    if (!createRunResponse.ok) {
      const error = await createRunResponse.json();
      throw new Error(`Run creation failed: ${error.error}`);
    }

    const runResult = await createRunResponse.json();
    const runId = runResult.run_id;
    console.log(`✅ Run created: ${runId}`);

    // Test 4: Get account usage statistics
    console.log('\n4. Testing usage tracking...');
    const usageResponse = await fetch(`${API_BASE}/api/accounts/${accountId}/usage`);
    
    if (!usageResponse.ok) {
      throw new Error('Usage tracking failed');
    }

    const usageResult = await usageResponse.json();
    console.log(`✅ Usage stats retrieved:`);
    console.log(`   Total runs: ${usageResult.usage_stats.total_runs}`);
    console.log(`   Running runs: ${usageResult.usage_stats.running_runs}`);
    console.log(`   Completed runs: ${usageResult.usage_stats.completed_runs}`);

    // Test 5: List all accounts
    console.log('\n5. Testing account listing...');
    const listResponse = await fetch(`${API_BASE}/api/accounts`);
    
    if (!listResponse.ok) {
      throw new Error('Account listing failed');
    }

    const listResult = await listResponse.json();
    console.log(`✅ Listed ${listResult.accounts.length} accounts`);

    // Test 6: Update account information
    console.log('\n6. Testing account update...');
    const updateResponse = await fetch(`${API_BASE}/api/accounts?account_id=${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_description: 'Updated test company description'
      })
    });

    if (!updateResponse.ok) {
      const error = await updateResponse.json();
      throw new Error(`Account update failed: ${error.error}`);
    }

    const updateResult = await updateResponse.json();
    console.log(`✅ Account updated: ${updateResult.account.company_description}`);

    console.log('\n🎉 All tests passed! User account management system is working correctly.');
    console.log('='.repeat(50));
    
    return {
      success: true,
      accountId,
      runId
    };

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('='.repeat(50));
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testAccountSystem().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { testAccountSystem };