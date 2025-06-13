// Notion helper functions for modular add-to-notion logic

/**
 * Generate the parent page title for the Notion database entry.
 * Format: "{Company Name} {Report Type/Short Description} Report - {MM/DD/YYYY}"
 */
export function generateParentPageTitle({ email, metadata, reportType, date }: {
  email?: string;
  metadata?: any;
  reportType?: string;
  date?: Date;
}): string {
  const companyName = extractCompanyName(email);
  const type = extractReportType(metadata, reportType);
  const dateStr = (date || new Date()).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  return `${companyName} ${type} Report - ${dateStr}`;
}

function upper(s: string): string { return s.toUpperCase(); }

/**
 * Extract the company name from an email address.
 * Example: harrison@cedarandcactus.com => "Cedar & Cactus"
 */
export function extractCompanyName(email?: string): string {
  if (!email) return 'Client';
  const domain: string = email.split('@')[1]?.split('.')[0] || '';
  // Split on hyphens/underscores and capitalize words
  return domain
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, function (substring: string, ...args: any[]): string { return substring.toUpperCase(); })
    .replace(/\bAnd\b/i, '&');
}

/**
 * Extract the contact name from an email address.
 * Example: harrison@cedarandcactus.com => "Harrison"
 */
export function extractContactName(email?: string): string {
  if (!email) return 'there';
  const name = email.split('@')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Extract the report type/short description from metadata or fallback.
 */
export function extractReportType(metadata?: any, fallback?: string): string {
  if (metadata?.reportType) return metadata.reportType;
  if (metadata?.analysisType) return metadata.analysisType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return fallback || 'Reddit Opportunity';
}

/**
 * Generate the homepage intro prompt for the LLM.
 */
export function generateHomepageIntroPrompt({ contactName, companyName, strategyReport, comprehensiveReport }: {
  contactName: string;
  companyName: string;
  strategyReport: string;
  comprehensiveReport: string;
}): string {
  return `Write a concise introduction for a client-facing Notion page. Start with a greeting to "${contactName} and the ${companyName} team". Then, in 1–2 sentences, summarize the value of the attached reports. Finish with 2–3 bullet points describing what the client will find in the Strategy Report and Comprehensive Analysis. Do not exceed this length.\n\nHere are the reports:\n\nStrategy Report:\n${strategyReport}\n\nComprehensive Report:\n${comprehensiveReport}`;
}

/**
 * Create the parent page content (just a link to the homepage).
 */
export function createParentPageContent({ homepageUrl }: { homepageUrl: string }): any[] {
  return [
    {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: 'Click here to view your report',
              link: { url: homepageUrl },
            },
          },
        ],
      },
    },
  ];
}

/**
 * Call OpenRouter's completion API to generate the homepage intro paragraph.
 * Requires OPENROUTER_API_KEY in the environment.
 */
export async function getHomepageIntroFromLLM(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful marketing analyst.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300,
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Generate Notion blocks for the homepage: intro, links to reports.
 */
export function createHomepageBlocks({ intro, strategyUrl, comprehensiveUrl }: {
  intro: string;
  strategyUrl?: string;
  comprehensiveUrl?: string;
}): any[] {
  const blocks: any[] = [];
  if (intro) {
    blocks.push({
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: intro } }],
      },
    });
  }
  if (strategyUrl) {
    blocks.push({
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: 'View Strategy Report', link: { url: strategyUrl } },
        }],
      },
    });
  }
  if (comprehensiveUrl) {
    blocks.push({
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: 'View Comprehensive Analysis', link: { url: comprehensiveUrl } },
        }],
      },
    });
  }
  return blocks;
}

// (Later) Add function to call OpenRouter for the intro paragraph 