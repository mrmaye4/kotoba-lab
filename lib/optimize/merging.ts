import Anthropic from '@anthropic-ai/sdk'
import type { RuleForGrouping } from './grouping'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type MergedRuleResult = {
  title: string
  description: string | null
  formula: string | null
  type: 'rule' | 'structure' | 'collocation'
  aiContext: string | null
  difficulty: number
  examples: string[]
}

export async function generateMergedRule(
  groupName: string,
  sourceRules: (RuleForGrouping & {
    formula: string | null
    aiContext: string | null
    difficulty: number
    examples: string[] | null
  })[],
  languageName: string,
  interfaceLanguage = 'en'
): Promise<MergedRuleResult> {
  const rulesText = sourceRules.map(r => {
    const parts = [`Title: ${r.title}`]
    if (r.description) parts.push(`Description: ${r.description}`)
    if (r.formula) parts.push(`Formula: ${r.formula}`)
    if (r.examples?.length) parts.push(`Examples: ${r.examples.join(' | ')}`)
    parts.push(`Type: ${r.type}, Difficulty: ${r.difficulty}`)
    return parts.join('\n')
  }).join('\n\n---\n\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are a ${languageName} language teacher creating a comprehensive study rule. The following rules all relate to "${groupName}". Merge them into ONE thorough, complete rule that preserves ALL important details, nuances, exceptions, and examples from the source rules — do not omit anything significant. Return ONLY valid JSON, no markdown:
{
  "title": "concise rule name",
  "description": "thorough explanation covering all key points, exceptions, and usage notes from the source rules",
  "formula": "structural formula showing the pattern (e.g. Subject + Verb + Object) or null if not applicable",
  "type": "rule|structure|collocation",
  "aiContext": "detailed hints for exercise generation: what constructions to test, common mistakes to check for, context to use",
  "difficulty": 1,
  "examples": ["example 1 with translation", "example 2 with translation", "example 3 with translation", "example 4 with translation", "example 5 with translation"]
}
Rules:
- type: rule=grammatical rule, structure=sentence pattern, collocation=fixed word combination
- difficulty: 1=beginner, 2=elementary, 3=intermediate, 4=upper-intermediate, 5=advanced. Average the source difficulties.
- description: must be comprehensive, 3-6 sentences, covering all nuances from source rules
- examples: provide 4-6 varied ${languageName} examples with translations
- aiContext: detailed enough for an AI to generate diverse practice exercises
IMPORTANT: Write title, description, formula, and aiContext in ${interfaceLanguage}. Examples should be in ${languageName}.`,
    messages: [{ role: 'user', content: rulesText }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const result = JSON.parse(cleaned)

  return {
    title: result.title ?? 'Merged rule',
    description: result.description ?? null,
    formula: result.formula ?? null,
    type: ['rule', 'structure', 'collocation'].includes(result.type) ? result.type : 'rule',
    aiContext: result.aiContext ?? null,
    difficulty: typeof result.difficulty === 'number' ? Math.min(5, Math.max(1, result.difficulty)) : 3,
    examples: Array.isArray(result.examples) ? result.examples : [],
  }
}