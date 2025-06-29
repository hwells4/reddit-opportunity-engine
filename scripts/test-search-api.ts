#!/usr/bin/env npx tsx

/**
 * Test script for the new search API
 * Tests: KeywordQueryBuilder, RedditBulkSearch, and basic pipeline
 */

// Load environment variables from .env file
import { readFileSync } from 'fs';
import { join } from 'path';

try {
  const envPath = join(process.cwd(), '.env');
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim();
      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '');
      process.env[key.trim()] = cleanValue;
    }
  });
} catch (error) {
  console.log('Note: Could not load .env file, using existing environment variables');
}

import { KeywordQueryBuilder } from '../lib/search/keyword-query-builder';
import { RedditBulkSearch } from '../lib/search/reddit-bulk-search';
import { PostProcessor } from '../lib/search/post-processor';

async function testKeywordBuilder() {
  console.log('\n🔍 Testing KeywordQueryBuilder...\n');
  
  try {
    const builder = new KeywordQueryBuilder();
    
    const testCase = {
      audience: "early-career software developers",
      questions: [
        "How do they describe slow CI/CD pipelines?",
        "What parts of code review frustrate them most?"
      ]
    };
    
    console.log('Input:', testCase);
    
    const atoms = await builder.buildKeywordAtoms(testCase);
    console.log(`\n✅ Generated ${atoms.length} keyword atoms:`);
    atoms.slice(0, 10).forEach(atom => {
      console.log(`  - "${atom.term}" (${atom.type}, weight: ${atom.weight.toFixed(2)})`);
    });
    
    const queries = builder.buildSearchQueries(atoms);
    console.log(`\n✅ Generated ${queries.length} search queries:`);
    queries.slice(0, 5).forEach(query => {
      console.log(`  - "${query}"`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ KeywordQueryBuilder test failed:', error);
    return false;
  }
}

async function testRedditSearch() {
  console.log('\n\n🔍 Testing RedditBulkSearch...\n');
  
  try {
    const search = new RedditBulkSearch(false); // Free tier
    
    // Test with simple queries to avoid rate limits
    const result = await search.bulkSearch({
      queries: ["CI/CD pipeline slow", "code review frustration"],
      ageDays: 30,
      minScore: 5,
      premium: false,
      maxResultsPerQuery: 10 // Small limit for testing
    });
    
    console.log('✅ Search Results:');
    console.log(`  - Total posts fetched: ${result.stats.totalFetched}`);
    console.log(`  - API calls made: ${result.stats.apiCalls}`);
    console.log(`  - Rate limit hits: ${result.stats.rateLimitHits}`);
    console.log(`  - Errors: ${result.stats.errors}`);
    
    if (result.posts.length > 0) {
      console.log(`\n  Sample posts (showing first 3):`);
      result.posts.slice(0, 3).forEach((post, i) => {
        console.log(`\n  ${i + 1}. r/${post.subreddit} - ${post.title}`);
        console.log(`     Score: ${post.score} | Comments: ${post.numComments}`);
        console.log(`     Snippet: ${post.snippet.substring(0, 100)}...`);
      });
    }
    
    return true;
  } catch (error) {
    console.error('❌ RedditBulkSearch test failed:', error);
    return false;
  }
}

async function testFullPipeline() {
  console.log('\n\n🔍 Testing Full Search API Pipeline...\n');
  
  try {
    const testPayload = {
      audience: "DevOps engineers",
      questions: [
        "What are their biggest pain points with container orchestration?",
        "How do they handle database migrations in production?"
      ],
      maxPosts: 20,
      ageDays: 7,
      minScore: 3
    };
    
    console.log('Test payload:', testPayload);
    
    // Test the actual API endpoint
    const response = await fetch('http://localhost:3000/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API returned ${response.status}: ${error}`);
    }
    
    const data = await response.json();
    
    console.log('\n✅ API Response:');
    console.log(`  - Run ID: ${data.runId}`);
    console.log(`  - Posts returned: ${data.posts.length}`);
    console.log(`  - Stats:`, data.stats);
    
    if (data.posts.length > 0) {
      console.log('\n  First post:');
      const post = data.posts[0];
      console.log(`    Title: ${post.title}`);
      console.log(`    Subreddit: r/${post.subreddit}`);
      console.log(`    Score: ${post.score}`);
      console.log(`    URL: ${post.url}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Full pipeline test failed:', error);
    console.log('\nMake sure the Next.js dev server is running (npm run dev)');
    return false;
  }
}

async function testPostProcessor() {
  console.log('\n\n🔍 Testing PostProcessor...\n');
  
  const samplePost = {
    id: 'test123',
    url: 'https://reddit.com/r/test/comments/test123',
    score: 42,
    createdUtc: Date.now() / 1000,
    subreddit: 'programming',
    title: '**Help!** My CI/CD pipeline is *extremely* slow [Need Advice]',
    snippet: '',
    selfText: `## The Problem

I'm experiencing **major** issues with our CI/CD pipeline. Here's what's happening:

1. Build times have gone from ~5 minutes to **45+ minutes**
2. Tests are flaky and fail randomly
3. Docker builds are taking forever

### What I've tried:
- Upgrading runners
- Adding more cache layers
- Parallelizing tests

Nothing seems to work! Has anyone dealt with this before? 

Edit: Thanks for all the suggestions!

Edit 2: Solved it! The issue was [this specific thing](https://example.com)...

\`\`\`bash
docker build --cache-from=...
\`\`\`

TL;DR: Check your cache invalidation!`
  };
  
  const processed = PostProcessor.processPost(samplePost);
  
  console.log('Original title:', samplePost.title);
  console.log('Cleaned title:', processed.title);
  console.log('\nOriginal text length:', samplePost.selfText.length);
  console.log('Processed text length:', processed.selfText?.length);
  console.log('\nSnippet:', processed.snippet);
  
  return true;
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Search API Tests...\n');
  console.log('Using environment:');
  console.log(`  - OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`  - REDDIT_ENTERPRISE_KEY: ${process.env.REDDIT_ENTERPRISE_KEY ? '✅ Set' : '❌ Not set (using free tier)'}`);
  
  const tests = [
    { name: 'PostProcessor', fn: testPostProcessor },
    { name: 'KeywordQueryBuilder', fn: testKeywordBuilder },
    { name: 'RedditBulkSearch', fn: testRedditSearch },
    // { name: 'Full Pipeline', fn: testFullPipeline } // Uncomment when dev server is running
  ];
  
  let passed = 0;
  
  for (const test of tests) {
    if (await test.fn()) {
      passed++;
    }
  }
  
  console.log(`\n\n📊 Test Summary: ${passed}/${tests.length} tests passed`);
  
  if (passed === tests.length) {
    console.log('✅ All tests passed! The search API foundation is working correctly.');
  } else {
    console.log('❌ Some tests failed. Please check the errors above.');
  }
}

// Run the tests
runTests().catch(console.error);