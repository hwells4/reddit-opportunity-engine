/**
 * Utility for testing markdown parsing locally
 * Run with: npx ts-node utils/test-markdown-parsing.ts
 */

// Copy the relevant functions from the API route for testing
interface MarkdownMatch {
  start: number;
  end: number;
  type: 'link' | 'bold' | 'italic' | 'code' | 'strikethrough';
  text: string;
  url?: string;
  rawMatch: string;
}

const DEBUG = true;

function debugLog(context: string, data: any) {
  if (DEBUG) {
    console.log(`[DEBUG - ${context}]:`, JSON.stringify(data, null, 2));
  }
}

function parseRichText(text: string): any[] {
  debugLog('parseRichText-input', { text, length: text.length });
  
  if (!text || text.length === 0) {
    return [{
      type: "text",
      text: { content: "" },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: "default"
      }
    }];
  }

  // Enhanced regex patterns with proper non-greedy matching
  const patterns = [
    // Links: [text](url) - highest priority
    { regex: /\[([^\]]+)\]\(([^)]+)\)/g, type: 'link' as const, priority: 1 },
    // Code: `text` - high priority to avoid conflicts with other formatting
    { regex: /`([^`]+?)`/g, type: 'code' as const, priority: 2 },
    // Bold: **text** or __text__
    { regex: /\*\*([^*]+?)\*\*/g, type: 'bold' as const, priority: 3 },
    { regex: /__([^_]+?)__/g, type: 'bold' as const, priority: 3 },
    // Strikethrough: ~~text~~
    { regex: /~~([^~]+?)~~/g, type: 'strikethrough' as const, priority: 4 },
    // Italic: *text* or _text_ (lowest priority to avoid conflicts with bold)
    { regex: /(?<!\*)\*([^*]+?)\*(?!\*)/g, type: 'italic' as const, priority: 5 },
    { regex: /(?<!_)_([^_]+?)_(?!_)/g, type: 'italic' as const, priority: 5 },
  ];

  // Find all matches with improved conflict resolution
  const matches: MarkdownMatch[] = [];
  
  patterns.forEach(pattern => {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const matchData: MarkdownMatch = {
        start: match.index,
        end: match.index + match[0].length,
        type: pattern.type,
        text: pattern.type === 'link' ? match[1] : match[1],
        rawMatch: match[0]
      };
      
      if (pattern.type === 'link') {
        matchData.url = match[2];
      }
      
      matches.push(matchData);
      
      // Prevent infinite loops
      if (regex.lastIndex === match.index) {
        regex.lastIndex = match.index + 1;
      }
    }
  });

  // Sort by priority first, then by start position
  matches.sort((a, b) => {
    const priorityA = patterns.find(p => p.type === a.type)?.priority || 999;
    const priorityB = patterns.find(p => p.type === b.type)?.priority || 999;
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return a.start - b.start;
  });

  // Remove overlapping matches (keep higher priority ones)
  const filteredMatches: MarkdownMatch[] = [];
  for (const match of matches) {
    const hasOverlap = filteredMatches.some(existing => 
      (match.start >= existing.start && match.start < existing.end) ||
      (match.end > existing.start && match.end <= existing.end) ||
      (match.start <= existing.start && match.end >= existing.end)
    );
    
    if (!hasOverlap) {
      filteredMatches.push(match);
    }
  }

  // Sort final matches by position
  filteredMatches.sort((a, b) => a.start - b.start);
  
  debugLog('parseRichText-matches', { 
    originalText: text,
    totalMatches: matches.length,
    filteredMatches: filteredMatches.length,
    matches: filteredMatches.map(m => ({
      type: m.type,
      text: m.text,
      start: m.start,
      end: m.end,
      rawMatch: m.rawMatch
    }))
  });

  // Build rich text array
  const richText: any[] = [];
  let currentIndex = 0;

  for (const match of filteredMatches) {
    // Add plain text before this match
    if (currentIndex < match.start) {
      const plainText = text.substring(currentIndex, match.start);
      if (plainText) {
        richText.push({
          type: "text",
          text: { content: plainText },
          annotations: {
            bold: false,
            italic: false,
            strikethrough: false,
            underline: false,
            code: false,
            color: "default"
          }
        });
      }
    }

    // Create rich text object for the match
    const textObj: any = {
      type: "text",
      text: { content: match.text },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: "default"
      }
    };

    // Apply formatting based on match type
    switch (match.type) {
      case 'link':
        textObj.text.link = { url: match.url };
        break;
      case 'bold':
        textObj.annotations.bold = true;
        break;
      case 'italic':
        textObj.annotations.italic = true;
        break;
      case 'code':
        textObj.annotations.code = true;
        break;
      case 'strikethrough':
        textObj.annotations.strikethrough = true;
        break;
    }

    richText.push(textObj);
    currentIndex = match.end;
  }

  // Add remaining plain text
  if (currentIndex < text.length) {
    const remainingText = text.substring(currentIndex);
    if (remainingText) {
      richText.push({
        type: "text",
        text: { content: remainingText },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: false,
          color: "default"
        }
      });
    }
  }

  // If no matches found, return plain text
  if (richText.length === 0) {
    richText.push({
      type: "text",
      text: { content: text },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: "default"
      }
    });
  }

  debugLog('parseRichText-output', { 
    inputLength: text.length,
    outputBlocks: richText.length,
    richText: richText 
  });

  return richText;
}

// Test cases
const testCases = [
  "This is **bold** text",
  "This is *italic* text", 
  "This is `code` text",
  "This is ~~strikethrough~~ text",
  "This is [a link](https://example.com)",
  "Mixed: **bold** and *italic* and `code`",
  "Complex: **Bold with *nested italic* inside**",
  "# This is a heading",
  "## This is another heading with **bold**",
  "- This is a bullet point with *italic*",
  "Multiple links: [Google](https://google.com) and [GitHub](https://github.com)",
  "Code with bold: `const test = 'hello'` and **bold text**",
  "Empty string: ",
];

console.log("🧪 Testing Markdown Parsing\n");

testCases.forEach((testCase, index) => {
  console.log(`\n--- Test Case ${index + 1}: "${testCase}" ---`);
  const result = parseRichText(testCase);
  
  console.log("📋 Rich Text Output:");
  result.forEach((block, i) => {
    console.log(`  ${i + 1}. "${block.text.content}" - annotations:`, block.annotations);
    if (block.text.link) {
      console.log(`     🔗 Link: ${block.text.link.url}`);
    }
  });
});

// Test with a typical Gumloop report sample
const sampleReport = `# Reddit Opportunity Analysis

## Executive Summary

This analysis reveals **significant opportunities** for growth in the following areas:

- **Community Engagement**: Active users showing *high interest* in product discussions
- **Content Strategy**: Popular posts demonstrate clear patterns
- **Market Validation**: Strong validation signals from [r/entrepreneur](https://reddit.com/r/entrepreneur)

### Key Findings

1. User sentiment is ~~negative~~ **positive** overall
2. \`growth_rate\` shows 23% increase
3. Links to [official documentation](https://docs.example.com) are frequently shared

> Quote: "This is the future of our industry"

---

For more details, see the comprehensive analysis below.`;

console.log("\n\n🔍 Testing Sample Report:");
console.log("Input:", sampleReport.substring(0, 200) + "...");

const reportResult = parseRichText(sampleReport);
console.log(`\nOutput: ${reportResult.length} rich text blocks generated`); 