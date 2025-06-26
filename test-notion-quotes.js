// Test script for Notion quotes integration
// Run with: node test-notion-quotes.js

async function testQuotesEndpoint() {
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : 'http://localhost:3000';

  console.log('🧪 Testing Notion Quotes Integration...\n');

  // Test 1: Check if we can fetch quotes for a run
  console.log('1️⃣ Testing quote fetching...');
  try {
    // First, let's get a sample run ID from the database
    const runsResponse = await fetch(`${baseUrl}/api/runs?limit=1`);
    const runsData = await runsResponse.json();
    
    if (!runsData.runs || runsData.runs.length === 0) {
      console.log('❌ No runs found in database. Create a run first.');
      return;
    }

    const testRunId = runsData.runs[0].run_id;
    console.log(`   Using run ID: ${testRunId}`);

    // Fetch quotes for this run
    const quotesResponse = await fetch(`${baseUrl}/api/add-to-notion/quotes?runId=${testRunId}`);
    const quotesData = await quotesResponse.json();

    console.log(`   ✅ Found ${quotesData.totalCount || 0} quotes`);
    if (quotesData.stats) {
      console.log(`   📊 Stats:`, quotesData.stats);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 2: Test adding quotes to Notion (dry run)
  console.log('\n2️⃣ Testing Notion quotes database creation...');
  try {
    // This is a dry run - we'll use a test run ID
    const testPayload = {
      runId: 'test-run-001',
      parentPageId: 'YOUR_PARENT_PAGE_ID_HERE', // Required: where to create the database
      companyName: 'Test Company',
      email: 'test@example.com'
    };

    console.log('   Note: This will create a dedicated quotes database for this run');
    console.log('   Payload:', testPayload);
    
    // Uncomment to actually test (requires valid Notion API key)
    /*
    const response = await fetch(`${baseUrl}/api/add-to-notion/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    
    const data = await response.json();
    console.log('   Response:', data);
    */
    
    console.log('   ⚠️  Skipping actual Notion API call (uncomment to test)');
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 3: Test the full integration flow
  console.log('\n3️⃣ Testing full add-to-notion flow with quotes...');
  console.log('   This would test the complete flow:');
  console.log('   - Creating reports in Notion');
  console.log('   - Fetching quotes from database');
  console.log('   - Creating dedicated quotes database per run');
  console.log('   - Adding quotes to individual database');
  console.log('   - Adding quotes link to branded homepage');
  console.log('   ⚠️  Requires valid reports and Notion API key');

  console.log('\n✅ Test script complete!');
  console.log('\nNext steps:');
  console.log('1. Ensure NOTION_API_KEY is set in environment');
  console.log('2. Run a discovery flow to generate quotes');
  console.log('3. Use the add-to-notion endpoint with a valid runId');
  console.log('4. Check the branded homepage for the dedicated quotes database');
  console.log('5. Each run gets its own quotes database - no filtering needed!');
}

// Helper function to test quote statistics
async function testQuoteStats() {
  console.log('\n📊 Testing Quote Statistics...');
  
  const sampleQuotes = [
    { category: 'user_needs', sentiment: 'frustrated', relevance_score: 1.0 },
    { category: 'user_needs', sentiment: 'positive', relevance_score: 1.0 },
    { category: 'feature_signals', sentiment: 'neutral', relevance_score: 0.5 },
    { category: 'general', sentiment: 'neutral', relevance_score: 0.0 }
  ];

  // Simulate getQuoteStats function
  const stats = {
    total: sampleQuotes.length,
    byCategory: {},
    bySentiment: {},
    relevant: 0
  };

  sampleQuotes.forEach(quote => {
    const category = quote.category || 'general';
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

    const sentiment = quote.sentiment || 'neutral';
    stats.bySentiment[sentiment] = (stats.bySentiment[sentiment] || 0) + 1;

    if (quote.relevance_score > 0) {
      stats.relevant++;
    }
  });

  console.log('   Sample stats:', stats);
}

// Run tests
testQuotesEndpoint().then(() => {
  testQuoteStats();
}).catch(console.error);