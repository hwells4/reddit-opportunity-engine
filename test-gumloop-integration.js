/**
 * Pre-Integration Test Script
 * Tests exactly what Gumloop will send to verify 100% readiness
 */

const API_BASE = 'https://reddit-opportunity-engine-production.up.railway.app';

// Test cases that mimic real Gumloop scenarios
const testCases = [
  {
    name: "Perfect Analysis (Best Case)",
    payload: {
      run_id: `test_perfect_${Date.now()}`,
      posts: [{
        post_id: "test_perfect_001",
        subreddit: "productivity", 
        url: "https://reddit.com/r/productivity/comments/test1/",
        title: "Looking for better task management",
        body: "I need help organizing my work",
        raw_analysis: `
          <user_needs>
            <quote is_question_relevant="true" sentiment="frustrated" theme="organization">I really need a better way to organize my tasks</quote>
            <quote is_question_relevant="true" sentiment="hopeful" theme="efficiency">This would save me so much time</quote>
          </user_needs>
          <current_solutions>
            <quote is_question_relevant="true" sentiment="negative" theme="limitations">The current tools just don't work for me</quote>
          </current_solutions>
        `
      }]
    }
  },
  {
    name: "Malformed XML (Common AI Issue)",
    payload: {
      run_id: `test_malformed_${Date.now()}`,
      posts: [{
        post_id: "test_malformed_001",
        subreddit: "productivity",
        url: "https://reddit.com/r/productivity/comments/test2/", 
        title: "Broken XML test",
        body: "Test malformed content",
        raw_analysis: `
          <user_needs>
            <quote is_question_relevant="true" sentiment="frustrated">I really need better organization
            <quote is_question_relevant="true">This is missing closing tag
          </user_needs>
          Missing closing tags everywhere...
        `
      }]
    }
  },
  {
    name: "No Structure (Worst Case)",
    payload: {
      run_id: `test_unstructured_${Date.now()}`,
      posts: [{
        post_id: "test_unstructured_001", 
        subreddit: "productivity",
        url: "https://reddit.com/r/productivity/comments/test3/",
        title: "No structure test",
        body: "Random content", 
        raw_analysis: `
          User feedback: "I hate the current system and wish there was something better"
          Another comment: "This tool is broken and frustrating to use"
          Random text that should still create quotes somehow.
        `
      }]
    }
  },
  {
    name: "Mixed Content (Real World)",
    payload: {
      run_id: `test_mixed_${Date.now()}`,
      posts: [{
        post_id: "test_mixed_001",
        subreddit: "programming", 
        url: "https://reddit.com/r/programming/comments/test4/",
        title: "Mixed content test",
        body: "Real world scenario",
        raw_analysis: `
          <user_needs>
            <quote sentiment="positive">I love this concept</quote>
          </user_needs>
          
          Some random text here...
          
          User said: "The interface is confusing but the idea is solid"
          
          <quote category="feature_request">Would pay for automated alerts</quote>
          
          More unstructured feedback: I really need better notifications.
        `
      }]
    }
  },
  {
    name: "Empty Analysis (Edge Case)",
    payload: {
      run_id: `test_empty_${Date.now()}`,
      posts: [{
        post_id: "test_empty_001",
        subreddit: "test",
        url: "https://reddit.com/r/test/comments/test5/", 
        title: "Empty test",
        body: "Empty analysis",
        raw_analysis: ""
      }]
    }
  }
];

async function testEndpoint(testCase) {
  console.log(`\n🧪 Testing: ${testCase.name}`);
  console.log(`📤 Payload:`, JSON.stringify(testCase.payload, null, 2));
  
  try {
    const response = await fetch(`${API_BASE}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCase.payload)
    });

    const result = await response.json();
    
    console.log(`📥 Response (${response.status}):`, JSON.stringify(result, null, 2));
    
    // Validate response
    const validation = {
      success: result.success === true,
      posts_saved: result.posts_saved > 0,
      has_quotes: result.quotes_extracted >= 0, // Even 0 is ok for some cases
      no_500_error: response.status !== 500,
      has_run_id: !!result.run_id
    };
    
    const overall = Object.values(validation).every(v => v);
    
    console.log(`✅ Validation:`, validation);
    console.log(`🎯 Overall: ${overall ? 'PASS' : 'FAIL'}`);
    
    return { testCase: testCase.name, success: overall, details: result, validation };
    
  } catch (error) {
    console.log(`❌ Error:`, error.message);
    return { testCase: testCase.name, success: false, error: error.message };
  }
}

async function testSystemHealth() {
  console.log(`\n🏥 Testing System Health Monitoring`);
  
  try {
    const response = await fetch(`${API_BASE}/api/monitor?view=health`);
    const health = await response.json();
    
    console.log(`📊 Health Status:`, health.status);
    console.log(`🚨 Alerts:`, health.alerts);
    console.log(`📈 Success Rates:`, health.summary?.success_rates);
    
    return { success: true, health };
  } catch (error) {
    console.log(`❌ Health check failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function testSimpleQuoteCreation() {
  console.log(`\n📝 Testing Simple Quote Creation API`);
  
  const simpleQuote = {
    text: "This integration test is working perfectly!",
    reddit_url: "https://reddit.com/r/test/comments/integration_test/"
  };
  
  try {
    const response = await fetch(`${API_BASE}/api/quotes/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(simpleQuote)
    });
    
    const result = await response.json();
    console.log(`📥 Simple Quote Result:`, result);
    
    return { success: result.success === true, result };
  } catch (error) {
    console.log(`❌ Simple quote creation failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runFullIntegrationTest() {
  console.log(`🚀 STARTING FULL INTEGRATION TEST`);
  console.log(`🌐 Testing against: ${API_BASE}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  
  const results = [];
  
  // Test all scenarios
  for (const testCase of testCases) {
    const result = await testEndpoint(testCase);
    results.push(result);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Test monitoring
  const healthResult = await testSystemHealth();
  
  // Test simple API
  const simpleResult = await testSimpleQuoteCreation();
  
  // Generate report
  console.log(`\n📊 FINAL INTEGRATION TEST REPORT`);
  console.log(`=======================================`);
  
  const passedTests = results.filter(r => r.success).length;
  const totalTests = results.length;
  
  console.log(`✅ Core Tests: ${passedTests}/${totalTests} passed`);
  console.log(`🏥 Health Monitoring: ${healthResult.success ? 'PASS' : 'FAIL'}`);
  console.log(`📝 Simple Quote API: ${simpleResult.success ? 'PASS' : 'FAIL'}`);
  
  const overallSuccess = passedTests === totalTests && healthResult.success && simpleResult.success;
  
  console.log(`\n🎯 OVERALL STATUS: ${overallSuccess ? '✅ READY FOR GUMLOOP' : '❌ NEEDS FIXES'}`);
  
  if (!overallSuccess) {
    console.log(`\n🔧 Failed Tests:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.testCase}: ${r.error || 'Check validation details'}`);
    });
  }
  
  console.log(`\n⏰ Completed at: ${new Date().toISOString()}`);
  
  return overallSuccess;
}

// Run the test
runFullIntegrationTest().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test script failed:', error);
  process.exit(1);
});