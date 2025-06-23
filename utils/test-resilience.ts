/**
 * Test cases to demonstrate the resilient processing system
 * These show how the system handles various failure scenarios gracefully
 */

export const TestCases = {
  // Perfect case - should extract quotes normally
  perfectAnalysis: `
    <user_needs>
      <quote is_question_relevant="true" sentiment="frustrated" theme="workflow">I really need a better way to organize my tasks</quote>
      <quote is_question_relevant="true" sentiment="positive" theme="efficiency">This would save me so much time</quote>
    </user_needs>
    <current_solutions>
      <quote is_question_relevant="true" sentiment="negative" theme="limitations">The current tools just don't work for me</quote>
    </current_solutions>
  `,

  // Malformed XML - should trigger fallback parsers
  malformedXML: `
    <user_needs>
      <quote is_question_relevant="true" sentiment="frustrated" theme="workflow">I really need a better way to organize my tasks
      <quote is_question_relevant="true" sentiment="positive">This would save me so much time</quote>
    </user_needs>
    <current_solutions>
      Missing closing tag here...
  `,

  // Missing attributes - should use defaults
  missingAttributes: `
    <user_needs>
      <quote>I really need a better way to organize my tasks</quote>
      <quote is_question_relevant="true">This would save me so much time</quote>
    </user_needs>
  `,

  // No structured sections - should trigger generic extraction
  genericQuotes: `
    Some random text here.
    <quote category="pain_point" sentiment="negative">I hate dealing with this every day</quote>
    More random text.
    <quote category="feature_request">Would love to see automated sorting</quote>
  `,

  // Only quoted text - should extract any quoted content
  onlyQuotedText: `
    User said: "I'm really struggling with time management lately"
    Another comment: "The interface is confusing and hard to navigate"
    Final thought: "Would definitely pay for a solution that works"
  `,

  // Mixed feedback without structure - should extract sentences
  mixedFeedback: `
    The user mentioned they love the core concept but hate the implementation.
    I really wish there was a better way to handle notifications.
    We've been frustrated with the current solution for months.
    This feature doesn't work properly and needs fixing.
  `,

  // Minimal text - just enough for quote creation
  minimalQuote: `
    Someone said: "This is exactly what I need"
  `,

  // Complete garbage - should create unstructured fallback
  completeGarbage: `
    Random text with no structure
    %%%invalid XML<<<
    Some user feedback but no proper formatting
    This is unparseable content
  `,

  // Empty content - should handle gracefully
  emptyContent: ``,

  // Valid but empty sections
  emptyValidStructure: `
    <user_needs>
    </user_needs>
    <current_solutions>
    </current_solutions>
  `
}

/**
 * Test the resilience system with various scenarios
 */
export async function testResilienceSystem() {
  const results = []
  
  for (const [testName, testContent] of Object.entries(TestCases)) {
    try {
      // Simulate a post processing request
      const testPost = {
        post_id: `test_${testName}_${Date.now()}`,
        subreddit: 'test',
        url: 'https://reddit.com/test',
        title: `Test post for ${testName}`,
        body: 'Test content',
        raw_analysis: testContent
      }

      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_id: `test_run_${Date.now()}`,
          posts: [testPost]
        })
      })

      const result = await response.json()
      
      results.push({
        testName,
        success: result.success,
        postsSaved: result.posts_saved,
        quotesExtracted: result.quotes_extracted,
        errors: result.total_errors,
        fallbacksUsed: result.processing_details?.fallbacks_used || [],
        details: result.processing_details
      })

    } catch (error: any) {
      results.push({
        testName,
        success: false,
        error: error.message
      })
    }
  }

  return results
}

/**
 * Generate a test report showing resilience capabilities
 */
export function generateResilienceReport(testResults: any[]) {
  let report = `# Resilience System Test Report\n\n`
  
  const totalTests = testResults.length
  const successfulTests = testResults.filter(r => r.success).length
  const testsWithFallbacks = testResults.filter(r => r.fallbacksUsed?.length > 0).length
  
  report += `## Summary\n`
  report += `- Total Tests: ${totalTests}\n`
  report += `- Successful Processing: ${successfulTests}/${totalTests} (${((successfulTests/totalTests)*100).toFixed(1)}%)\n`
  report += `- Tests Using Fallbacks: ${testsWithFallbacks}/${totalTests} (${((testsWithFallbacks/totalTests)*100).toFixed(1)}%)\n\n`
  
  report += `## Test Details\n\n`
  
  for (const result of testResults) {
    report += `### ${result.testName}\n`
    if (result.success) {
      report += `✅ **Success** - Posts Saved: ${result.postsSaved}, Quotes: ${result.quotesExtracted}\n`
      if (result.fallbacksUsed.length > 0) {
        report += `🔄 Fallbacks Used: ${result.fallbacksUsed.join(', ')}\n`
      }
      if (result.errors > 0) {
        report += `⚠️ Errors: ${result.errors} (partial success)\n`
      }
    } else {
      report += `❌ **Failed** - ${result.error || 'Unknown error'}\n`
    }
    report += `\n`
  }
  
  return report
}

// Example usage for testing locally
export const sampleTestPayload = {
  run_id: "test_resilience_" + Date.now(),
  posts: [
    {
      post_id: "test_perfect",
      subreddit: "test",
      url: "https://reddit.com/test1",
      title: "Perfect analysis test",
      body: "Test content",
      raw_analysis: TestCases.perfectAnalysis
    },
    {
      post_id: "test_malformed", 
      subreddit: "test",
      url: "https://reddit.com/test2",
      title: "Malformed XML test",
      body: "Test content",
      raw_analysis: TestCases.malformedXML
    },
    {
      post_id: "test_garbage",
      subreddit: "test", 
      url: "https://reddit.com/test3",
      title: "Complete garbage test",
      body: "Test content",
      raw_analysis: TestCases.completeGarbage
    }
  ]
}