#!/usr/bin/env npx tsx

/**
 * Full integration test for the search API
 */

// Load environment variables
import { readFileSync } from 'fs';
import { join } from 'path';

try {
  const envPath = join(process.cwd(), '.env');
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim();
      const cleanValue = value.replace(/^["']|["']$/g, '');
      process.env[key.trim()] = cleanValue;
    }
  });
} catch (error) {
  console.log('Note: Could not load .env file');
}

// Test different search scenarios
const testScenarios = [
  {
    name: 'Basic Search',
    payload: {
      audience: 'junior developers',
      questions: [
        'What challenges do they face learning Git?',
        'How do they debug code effectively?'
      ],
      maxPosts: 5,
      ageDays: 7,
      minScore: 2
    }
  },
  {
    name: 'DevOps Search',
    payload: {
      audience: 'DevOps engineers',
      questions: [
        'What are their pain points with CI/CD pipelines?',
        'How do they handle infrastructure as code?',
        'What monitoring tools do they prefer?'
      ],
      maxPosts: 10,
      ageDays: 30,
      minScore: 5,
      embedProvider: 'openai'
    }
  },
  {
    name: 'Data Science Search',
    payload: {
      audience: 'data scientists using Python',
      questions: [
        'What are their biggest frustrations with pandas?',
        'How do they handle large datasets?'
      ],
      maxPosts: 15,
      ageDays: 14,
      minScore: 3
    }
  }
];

async function testSearchAPI(scenario: typeof testScenarios[0]) {
  console.log(`\n📊 Testing: ${scenario.name}`);
  console.log('Payload:', JSON.stringify(scenario.payload, null, 2));
  
  const startTime = Date.now();
  
  try {
    const response = await fetch('http://localhost:3000/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Optional: Link to a run ID
        // 'X-Subtext-Run': 'test-run-123'
      },
      body: JSON.stringify(scenario.payload)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API returned ${response.status}: ${error}`);
    }
    
    const data = await response.json();
    const elapsed = (Date.now() - startTime) / 1000;
    
    console.log('\n✅ Success!');
    console.log(`  Run ID: ${data.runId}`);
    console.log(`  Time: ${elapsed.toFixed(1)}s (API reported: ${data.stats.elapsedSec.toFixed(1)}s)`);
    console.log(`  Pipeline: ${data.stats.rawFetched} → ${data.stats.afterEmbed} → ${data.stats.afterGate} posts`);
    console.log(`  Cost: $${data.stats.tokenCostUSD.toFixed(4)}`);
    console.log(`  API Calls: ${data.stats.apiCalls}`);
    
    if (data.posts.length > 0) {
      console.log(`\n  Sample Results (showing ${Math.min(3, data.posts.length)}):`);
      data.posts.slice(0, 3).forEach((post: any, i: number) => {
        console.log(`\n  ${i + 1}. r/${post.subreddit} - ${post.title}`);
        console.log(`     Score: ${post.score} | Created: ${new Date(post.createdUtc * 1000).toLocaleDateString()}`);
        console.log(`     URL: ${post.url}`);
        if (post.snippet) {
          console.log(`     Preview: ${post.snippet.substring(0, 100)}...`);
        }
      });
    } else {
      console.log('\n  ⚠️ No posts returned');
    }
    
    return { success: true, data, elapsed };
    
  } catch (error) {
    console.error(`\n❌ Test failed: ${error}`);
    return { success: false, error, elapsed: (Date.now() - startTime) / 1000 };
  }
}

async function checkAPIKeys() {
  console.log('\n🔑 Checking API Keys:');
  const required = [
    { key: 'OPENAI_API_KEY', name: 'OpenAI' },
    { key: 'OPENROUTER_API_KEY', name: 'OpenRouter (for Gemini 2.5 Flash)' },
    { key: 'NEXT_PUBLIC_SUPABASE_URL', name: 'Supabase URL' },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', name: 'Supabase Key' }
  ];
  
  const optional = [
    { key: 'REDDIT_ENTERPRISE_KEY', name: 'Reddit Enterprise' }
  ];
  
  let allRequired = true;
  
  required.forEach(({ key, name }) => {
    if (process.env[key]) {
      console.log(`  ✅ ${name}`);
    } else {
      console.log(`  ❌ ${name} (required)`);
      allRequired = false;
    }
  });
  
  optional.forEach(({ key, name }) => {
    if (process.env[key]) {
      console.log(`  ✅ ${name} (optional)`);
    } else {
      console.log(`  ⚠️ ${name} (optional, using free tier)`);
    }
  });
  
  return allRequired;
}

async function runTests() {
  console.log('🚀 Reddit Search API Integration Test\n');
  
  // Check API keys
  const hasRequiredKeys = await checkAPIKeys();
  
  if (!hasRequiredKeys) {
    console.log('\n❌ Missing required API keys. Please check your .env file.');
    console.log('See .env.search.example for required variables.');
    return;
  }
  
  // Check if dev server is running
  try {
    await fetch('http://localhost:3000/api/search');
  } catch (error) {
    console.log('\n❌ Dev server not running. Start it with: npm run dev');
    return;
  }
  
  console.log('\n📡 Starting integration tests...\n');
  
  const results = [];
  let totalCost = 0;
  
  for (const scenario of testScenarios) {
    const result = await testSearchAPI(scenario);
    results.push(result);
    
    if (result.success && result.data) {
      totalCost += result.data.stats.tokenCostUSD;
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log('\n\n📊 Test Summary:');
  console.log('─'.repeat(50));
  
  const successful = results.filter(r => r.success).length;
  console.log(`  Tests Run: ${results.length}`);
  console.log(`  Successful: ${successful}`);
  console.log(`  Failed: ${results.length - successful}`);
  console.log(`  Total Cost: $${totalCost.toFixed(4)}`);
  console.log(`  Total Time: ${results.reduce((sum, r) => sum + r.elapsed, 0).toFixed(1)}s`);
  
  if (successful === results.length) {
    console.log('\n✅ All tests passed! The search API is working correctly.');
    console.log('\n💡 Performance Tips:');
    console.log('  - Use embedProvider: "miniLM" for local embeddings (when implemented)');
    console.log('  - Adjust SUBTEXT_OVERSAMPLE to control embedding stage filtering');
    console.log('  - Monitor costs with larger maxPosts values');
  } else {
    console.log('\n❌ Some tests failed. Check the errors above.');
  }
}

// Run the tests
runTests().catch(console.error);