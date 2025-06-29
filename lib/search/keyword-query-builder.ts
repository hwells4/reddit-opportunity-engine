import { getValidatedApiKey } from '../../utils/api-key-validation';

export interface KeywordQueryParams {
  audience: string;
  questions: string[];
}

export interface KeywordAtom {
  term: string;
  weight: number; // 0-1 weight for importance
  type: 'audience' | 'problem' | 'context' | 'solution';
}

export class KeywordQueryBuilder {
  private apiKey: string;
  private baseURL = "https://api.openai.com/v1";
  
  constructor() {
    const key = getValidatedApiKey('OPENAI_API_KEY');
    if (!key) {
      throw new Error('OPENAI_API_KEY is required for KeywordQueryBuilder');
    }
    this.apiKey = key;
  }
  
  /**
   * Expand audience + questions into ≤20 keyword atoms using OpenAI
   * FR-1: Temperature 0 for consistent results
   */
  async buildKeywordAtoms(params: KeywordQueryParams): Promise<KeywordAtom[]> {
    const prompt = this.createPrompt(params);
    
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a Reddit search optimization expert. Generate precise keyword atoms for finding relevant discussions.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0, // FR-1: Consistent results
          max_tokens: 1000,
          response_format: { type: "json_object" }
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${error}`);
      }
      
      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }
      
      const result = JSON.parse(content);
      return this.validateAndNormalizeAtoms(result.atoms || []);
      
    } catch (error) {
      console.error('KeywordQueryBuilder error:', error);
      // Fallback to basic keyword extraction
      return this.createFallbackAtoms(params);
    }
  }
  
  /**
   * Build Reddit search queries from keyword atoms
   */
  buildSearchQueries(atoms: KeywordAtom[]): string[] {
    const queries: string[] = [];
    
    // Strategy 1: High-weight audience + problem combinations
    const audienceAtoms = atoms.filter(a => a.type === 'audience' && a.weight > 0.7);
    const problemAtoms = atoms.filter(a => a.type === 'problem' && a.weight > 0.7);
    
    for (const audience of audienceAtoms.slice(0, 3)) {
      for (const problem of problemAtoms.slice(0, 3)) {
        queries.push(`${audience.term} ${problem.term}`);
      }
    }
    
    // Strategy 2: Context + solution combinations
    const contextAtoms = atoms.filter(a => a.type === 'context');
    const solutionAtoms = atoms.filter(a => a.type === 'solution');
    
    for (const context of contextAtoms.slice(0, 2)) {
      for (const solution of solutionAtoms.slice(0, 2)) {
        queries.push(`${context.term} ${solution.term}`);
      }
    }
    
    // Strategy 3: High-weight individual terms
    const highWeightTerms = atoms
      .filter(a => a.weight > 0.8)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
      
    for (const atom of highWeightTerms) {
      queries.push(atom.term);
    }
    
    // Deduplicate and limit to reasonable number
    return [...new Set(queries)].slice(0, 15);
  }
  
  private createPrompt(params: KeywordQueryParams): string {
    return `
Given the following audience and research questions, generate keyword atoms for Reddit search.

Audience: ${params.audience}
Questions:
${params.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Generate up to 20 keyword atoms that will help find Reddit posts where this audience discusses these topics.

CRITICAL Reddit Search Rules:
1. Use terms people ACTUALLY type on Reddit (informal, abbreviated, slang)
2. Include common complaints and rants (e.g., "why does X suck", "frustrated with", "anyone else hate")
3. Include Reddit-specific patterns (e.g., "ELI5", "PSA", "DAE", "TIL")
4. Focus on problem symptoms, not solutions (e.g., "slow builds" not "CI/CD optimization")
5. Include emotional language (e.g., "annoying", "painful", "nightmare", "driving me crazy")
6. Keep terms SHORT - Reddit search works better with 1-3 word phrases

Examples of good Reddit search terms:
- "junior dev struggling" instead of "early-career developer challenges"
- "git confusing" instead of "version control difficulties"
- "CI slow af" instead of "continuous integration performance issues"
- "debugging sucks" instead of "troubleshooting methodologies"

Return JSON with this structure:
{
  "atoms": [
    {"term": "keyword or phrase", "weight": 0.9, "type": "audience|problem|context|solution"},
    ...
  ]
}

Types:
- audience: How they identify themselves (e.g., "junior dev", "newbie", "beginner")
- problem: Their actual complaints (e.g., "slow builds", "git merge hell", "debugging nightmare")
- context: Specific tools/technologies they mention (e.g., "webpack", "github actions", "pytest")
- solution: What they're trying/asking about (e.g., "faster CI", "debug tips", "git workflow")`;
  }
  
  private validateAndNormalizeAtoms(atoms: any[]): KeywordAtom[] {
    const validTypes = new Set(['audience', 'problem', 'context', 'solution']);
    
    return atoms
      .filter(atom => 
        typeof atom.term === 'string' &&
        typeof atom.weight === 'number' &&
        validTypes.has(atom.type) &&
        atom.term.length > 0 &&
        atom.weight >= 0 &&
        atom.weight <= 1
      )
      .map(atom => ({
        term: atom.term.toLowerCase().trim(),
        weight: Math.max(0, Math.min(1, atom.weight)),
        type: atom.type
      }))
      .slice(0, 20); // Limit to 20 atoms per PRD
  }
  
  private createFallbackAtoms(params: KeywordQueryParams): KeywordAtom[] {
    const atoms: KeywordAtom[] = [];
    
    // Extract key terms from audience
    const audienceTerms = params.audience
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 3);
      
    for (const term of audienceTerms.slice(0, 5)) {
      atoms.push({
        term,
        weight: 0.7,
        type: 'audience'
      });
    }
    
    // Extract key terms from questions
    const stopWords = new Set(['how', 'do', 'they', 'which', 'what', 'when', 'where', 'the', 'a', 'an', 'and', 'or', 'but']);
    
    for (const question of params.questions) {
      const terms = question
        .toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 3 && !stopWords.has(term));
        
      for (const term of terms.slice(0, 3)) {
        atoms.push({
          term,
          weight: 0.6,
          type: 'problem'
        });
      }
    }
    
    return atoms.slice(0, 20);
  }
  
  /**
   * Calculate cost for OpenAI API calls
   * gpt-4o-mini: $0.150 per 1M input tokens, $0.600 per 1M output tokens
   */
  calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * 0.15;
    const outputCost = (outputTokens / 1_000_000) * 0.60;
    return inputCost + outputCost;
  }
}