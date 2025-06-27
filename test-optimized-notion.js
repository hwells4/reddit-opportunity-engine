/**
 * Test script for the optimized add-to-notion route
 */

const BASE_URL = "https://reddit-opportunity-engine-production.up.railway.app";
// const BASE_URL = "http://localhost:3000"; // For local testing

async function testOptimizedRoute() {
  console.log("🧪 Testing optimized add-to-notion route...\n");
  
  const testData = {
    comprehensiveReport: `# Market Research Report

## Executive Summary
This analysis reveals significant opportunities in the productivity tools market.

## Key Findings
- 45% increase in demand for automation tools
- Mobile-first approach is critical
- Integration capabilities are top priority

## Recommendations
1. Focus on mobile experience
2. Build robust API integrations
3. Prioritize automation features

## Detailed Analysis
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

### Market Trends
- Trend 1: Growing remote work adoption
- Trend 2: AI integration in productivity tools
- Trend 3: Collaboration platform consolidation

### Competitive Landscape
The market is dominated by several key players, but there's room for innovation in specific niches.`,
    
    strategyReport: `# Strategic Recommendations

## Priority Actions
1. **Product Development**: Focus on core automation features
2. **Market Entry**: Target SMB segment first
3. **Partnership Strategy**: Integrate with existing tools

## Timeline
- Q1: MVP development
- Q2: Beta testing
- Q3: Market launch
- Q4: Scale operations

## Success Metrics
- User acquisition: 1000+ users in Q1
- Revenue target: $100K ARR by year-end
- Customer satisfaction: >4.5/5 rating`,
    
    email: "test@example.com",
    runId: `test-${Date.now()}`,
    clientType: "demo",
    metadata: {
      generatedAt: new Date().toISOString(),
      analysisType: "multi-community",
      source: "test",
      communities_analyzed: "multiple"
    }
  };

  const startTime = Date.now();
  
  try {
    console.log("📤 Sending request to optimized route...");
    
    const response = await fetch(`${BASE_URL}/api/add-to-notion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Response:', errorText);
      return;
    }

    const result = await response.json();
    
    console.log(`✅ Initial response received in ${responseTime}ms`);
    console.log("📋 Response data:");
    console.log(JSON.stringify(result, null, 2));
    
    // Test status tracking if runId is provided
    if (result.data?.statusUrl) {
      console.log("\n🔍 Testing status tracking...");
      await testStatusTracking(result.data.statusUrl);
    }
    
    // Test the Notion pages
    if (result.data?.shareableUrl) {
      console.log(`\n🌐 Shareable URL: ${result.data.shareableUrl}`);
      console.log("✅ You can visit this URL to verify the Notion page was created");
    }
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Request failed after ${responseTime}ms:`, error.message);
  }
}

async function testStatusTracking(statusUrl) {
  const maxAttempts = 6; // Test for up to 30 seconds
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      console.log(`📊 Checking status (attempt ${i + 1}/${maxAttempts})...`);
      
      const response = await fetch(`${BASE_URL}${statusUrl}`);
      
      if (!response.ok) {
        console.error(`❌ Status check failed: ${response.status}`);
        return;
      }
      
      const status = await response.json();
      console.log(`   Status: ${status.status} (${status.progress.percentage}% complete)`);
      console.log(`   Completed tasks: ${JSON.stringify(status.tasks)}`);
      
      if (status.errors.length > 0) {
        console.log(`   ⚠️ Errors: ${status.errors.join(', ')}`);
      }
      
      if (status.status === 'completed') {
        console.log("✅ All async processing completed!");
        return;
      }
      
      if (status.status === 'failed') {
        console.log("❌ Async processing failed");
        return;
      }
      
      // Wait 5 seconds before next check
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
    } catch (error) {
      console.error(`❌ Status check error:`, error.message);
      return;
    }
  }
  
  console.log("⏰ Status monitoring timed out (async processing may still be running)");
}

// Performance comparison test
async function comparePerformance() {
  console.log("\n🏃‍♂️ Performance Comparison Test");
  console.log("This would compare the optimized vs original route");
  console.log("(Original route is backed up as route-original-backup.ts)");
  
  // Note: Could implement switching between routes and measuring response times
}

// Run the test
testOptimizedRoute()
  .then(() => {
    console.log("\n🎉 Test completed!");
  })
  .catch(error => {
    console.error("\n💥 Test failed:", error);
  });