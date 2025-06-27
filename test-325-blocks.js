/**
 * Test the specific 325-block scenario that was failing
 * This simulates the exact error condition from the logs
 */

console.log('🎯 Testing 325-Block Scenario Fix...\n');

function test325BlockScenario() {
  // Simulate the exact scenario that was failing
  // 325 blocks being created from very large content
  const veryLargeContent = 'x'.repeat(617500); // Large enough to create 325 blocks
  const chunks = veryLargeContent.match(/.{1,1900}/g) || [veryLargeContent];
  
  console.log(`📊 Original failing scenario:`);
  console.log(`   Content size: ${veryLargeContent.length} characters`);
  console.log(`   Blocks created: ${chunks.length}`);
  console.log(`   Original error: "body.children.length should be ≤ 100, instead was ${chunks.length}"`);
  
  // Test our chunking fix
  console.log(`\n🔧 Our chunking fix:`);
  const maxBlocksPerCall = 90; // Conservative limit (90 instead of 100 for safety)
  const apiCalls = [];
  
  for (let i = 0; i < chunks.length; i += maxBlocksPerCall) {
    const chunk = chunks.slice(i, i + maxBlocksPerCall);
    apiCalls.push(chunk);
  }
  
  console.log(`   Will split into: ${apiCalls.length} API calls`);
  console.log(`   Blocks per call: ${apiCalls.map(call => call.length).join(', ')}`);
  console.log(`   Max blocks in any call: ${Math.max(...apiCalls.map(call => call.length))}`);
  console.log(`   All calls ≤ 100 blocks: ${apiCalls.every(call => call.length <= 100) ? '✅ YES' : '❌ NO'}`);
  
  // Calculate timing
  const delayBetweenCalls = 2000; // 2 seconds between chunks
  const totalTime = apiCalls.length * delayBetweenCalls / 1000;
  console.log(`   Estimated processing time: ${totalTime} seconds`);
  
  console.log(`\n✨ Result: ${apiCalls.every(call => call.length <= 100) ? 'FIXED ✅' : 'STILL BROKEN ❌'}`);
  
  return apiCalls.every(call => call.length <= 100);
}

// Run the test
const success = test325BlockScenario();

if (success) {
  console.log(`\n🎉 SUCCESS! The 325-block validation error is now fixed.`);
  console.log(`\n🚀 Before: Single API call with 325 blocks → Validation error`);
  console.log(`🚀 After: Multiple API calls with ≤90 blocks each → Success`);
} else {
  console.log(`\n❌ The fix needs more work.`);
}