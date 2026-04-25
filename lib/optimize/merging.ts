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
  languageName: string
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
    max_tokens: 1024,
    system: `You are a ${languageName} language teacher. The following rules all relate to "${groupName}". Write ONE high-quality consolidated rule that captures all their key points without losing important details. Return ONLY valid JSON, no markdown:
{
  "title": "concise rule name",
  "description": "1-2 sentence explanation",
  "formula": "structural formula or null",
  "type": "rule|structure|collocation",
  "aiContext": "hints for exercise generation or null",
  "difficulty": 1-5,
  "examples": ["example 1", "example 2", "example 3"]
}
Type: rule=grammatical rule, structure=sentence pattern, collocation=fixed word combination.
Difficulty: 1=beginner to 5=advanced. If source rules have different difficulties, use the average.`,
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