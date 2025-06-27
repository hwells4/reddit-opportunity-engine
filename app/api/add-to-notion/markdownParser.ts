/**
 * Markdown Parser Utility for Notion
 * Converts markdown text into Notion block objects
 */

interface MarkdownMatch {
  start: number;
  end: number;
  type: 'link' | 'bold' | 'italic' | 'code' | 'strikethrough';
  text: string;
  url?: string;
  rawMatch: string;
}

const DEBUG = process.env.NODE_ENV === 'development' || process.env.NOTION_DEBUG === 'true';

function debugLog(context: string, data: any) {
  if (DEBUG) {
    console.log(`[MARKDOWN PARSER - ${context}]:`, JSON.stringify(data, null, 2));
  }
}

/**
 * Split long lines to avoid Notion's 2000 character limit
 */
function splitLongLine(line: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let currentIndex = 0;
  
  while (currentIndex < line.length) {
    const chunk = line.substring(currentIndex, currentIndex + maxLength);
    chunks.push(chunk);
    currentIndex += maxLength;
  }
  
  return chunks;
}

/**
 * Validate if a string is a valid URL
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse rich text with markdown formatting
 */
export function parseRichText(text: string): any[] {
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

  // Helper to parse non-link markdown (bold, italic, code, strikethrough)
  function parseNonLinkMarkdown(segment: string): any[] {
    // Order: code > bold > italic > strikethrough
    // Code
    const codePattern = /`([^`]+?)`/g;
    let codeMatch, lastIdx = 0, result: any[] = [];
    while ((codeMatch = codePattern.exec(segment)) !== null) {
      if (codeMatch.index > lastIdx) {
        result = result.concat(parseNonLinkMarkdown(segment.substring(lastIdx, codeMatch.index)));
      }
      result.push({
        type: "text",
        text: { content: codeMatch[1] },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: true,
          color: "default"
        }
      });
      lastIdx = codeMatch.index + codeMatch[0].length;
    }
    if (lastIdx < segment.length) {
      const remaining = segment.substring(lastIdx);
      
      // Bold
      const boldPattern = /\*\*([^*]+?)\*\*/g;
      let boldMatch, boldLastIdx = 0, boldResult: any[] = [];
      while ((boldMatch = boldPattern.exec(remaining)) !== null) {
        if (boldMatch.index > boldLastIdx) {
          boldResult = boldResult.concat(parseItalicAndStrikethrough(remaining.substring(boldLastIdx, boldMatch.index)));
        }
        boldResult.push({
          type: "text",
          text: { content: boldMatch[1] },
          annotations: {
            bold: true,
            italic: false,
            strikethrough: false,
            underline: false,
            code: false,
            color: "default"
          }
        });
        boldLastIdx = boldMatch.index + boldMatch[0].length;
      }
      if (boldLastIdx < remaining.length) {
        boldResult = boldResult.concat(parseItalicAndStrikethrough(remaining.substring(boldLastIdx)));
      }
      result = result.concat(boldResult);
    }
    return result.length > 0 ? result : [createPlainTextBlock(segment)];
  }

  // Helper to parse italic and strikethrough
  function parseItalicAndStrikethrough(segment: string): any[] {
    // Italic
    const italicPattern = /\*([^*]+?)\*/g;
    let italicMatch, lastIdx = 0, result: any[] = [];
    while ((italicMatch = italicPattern.exec(segment)) !== null) {
      if (italicMatch.index > lastIdx) {
        result = result.concat(parseStrikethrough(segment.substring(lastIdx, italicMatch.index)));
      }
      result.push({
        type: "text",
        text: { content: italicMatch[1] },
        annotations: {
          bold: false,
          italic: true,
          strikethrough: false,
          underline: false,
          code: false,
          color: "default"
        }
      });
      lastIdx = italicMatch.index + italicMatch[0].length;
    }
    if (lastIdx < segment.length) {
      result = result.concat(parseStrikethrough(segment.substring(lastIdx)));
    }
    return result.length > 0 ? result : [createPlainTextBlock(segment)];
  }

  // Helper to parse strikethrough
  function parseStrikethrough(segment: string): any[] {
    const strikethroughPattern = /~~([^~]+?)~~/g;
    let strikeMatch, lastIdx = 0, result: any[] = [];
    while ((strikeMatch = strikethroughPattern.exec(segment)) !== null) {
      if (strikeMatch.index > lastIdx) {
        result.push(createPlainTextBlock(segment.substring(lastIdx, strikeMatch.index)));
      }
      result.push({
        type: "text",
        text: { content: strikeMatch[1] },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: true,
          underline: false,
          code: false,
          color: "default"
        }
      });
      lastIdx = strikeMatch.index + strikeMatch[0].length;
    }
    if (lastIdx < segment.length) {
      result.push(createPlainTextBlock(segment.substring(lastIdx)));
    }
    return result.length > 0 ? result : [createPlainTextBlock(segment)];
  }

  // Helper to create plain text block
  function createPlainTextBlock(content: string): any {
    return {
      type: "text",
      text: { content },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: "default"
      }
    };
  }

  // Parse links first
  const linkPattern = /\[([^\]]+?)\]\(([^)]+?)\)/g;
  let linkMatch;
  let lastIndex = 0;
  const richTextArray: any[] = [];

  while ((linkMatch = linkPattern.exec(text)) !== null) {
    // Add text before the link
    if (linkMatch.index > lastIndex) {
      const beforeLink = text.substring(lastIndex, linkMatch.index);
      richTextArray.push(...parseNonLinkMarkdown(beforeLink));
    }

    // Add the link
    const linkText = linkMatch[1];
    const linkUrl = linkMatch[2];
    
    // Validate URL
    const validUrl = isValidUrl(linkUrl) ? linkUrl : `https://${linkUrl}`;
    
    richTextArray.push({
      type: "text",
      text: {
        content: linkText,
        link: { url: validUrl }
      },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: "default"
      }
    });

    lastIndex = linkMatch.index + linkMatch[0].length;
  }

  // Add remaining text after the last link
  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex);
    richTextArray.push(...parseNonLinkMarkdown(remaining));
  }

  // If no links were found, parse the entire text for other formatting
  if (richTextArray.length === 0) {
    richTextArray.push(...parseNonLinkMarkdown(text));
  }

  return richTextArray;
}

/**
 * Convert markdown text to Notion blocks
 */
export function createBlocksFromMarkdown(markdown: string): any[] {
  debugLog('createBlocksFromMarkdown-input', { 
    markdown,
    totalLength: markdown.length,
    lineCount: markdown.split('\n').length
  });

  const lines = markdown.split('\n');
  const blocks: any[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (trimmedLine === '') {
      continue;
    }

    let blockType: string = "paragraph";
    let content: string = "";
    let richText: any[] = [];

    if (line.startsWith('# ')) {
      blockType = "heading_1";
      content = line.substring(2);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        heading_1: { rich_text: richText },
      });
    } else if (line.startsWith('## ')) {
      blockType = "heading_2";
      content = line.substring(3);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        heading_2: { rich_text: richText },
      });
    } else if (line.startsWith('### ')) {
      blockType = "heading_3";
      content = line.substring(4);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        heading_3: { rich_text: richText },
      });
    } else if (line.startsWith('#### ')) {
      // Notion doesn't support h4, convert to h3
      blockType = "heading_3";
      content = line.substring(5);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        heading_3: { rich_text: richText },
      });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blockType = "bulleted_list_item";
      content = line.substring(2);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        bulleted_list_item: { rich_text: richText },
      });
    } else if (/^\d+\.\s/.test(line)) {
      blockType = "numbered_list_item";
      content = line.replace(/^\d+\.\s/, '');
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        numbered_list_item: { rich_text: richText },
      });
    } else if (line.startsWith('> ')) {
      blockType = "quote";
      content = line.substring(2);
      richText = parseRichText(content);
      blocks.push({
        type: blockType,
        quote: { rich_text: richText },
      });
    } else if (line.startsWith('---') || line.startsWith('***')) {
      blocks.push({
        type: "divider",
        divider: {},
      });
    } else {
      // Regular paragraph
      blockType = "paragraph";
      content = line;
      
      // Split long lines to avoid Notion's 2000 character limit
      if (line.length > 1900) {
        const lineChunks = splitLongLine(line, 1900);
        lineChunks.forEach((chunk: string) => {
          richText = parseRichText(chunk);
          blocks.push({
            type: blockType,
            paragraph: { rich_text: richText },
          });
        });
      } else {
        richText = parseRichText(content);
        blocks.push({
          type: blockType,
          paragraph: { rich_text: richText },
        });
      }
    }
  }
  
  return blocks;
}