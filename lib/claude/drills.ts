import Anthropic from '@anthropic-ai/sdk'
import type { RuleWithStats } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type RawDrillItem = {
  prompt: string
  choices: string[]
  correctAnswer: string
}

export async function generateDrillItems(rule: RuleWithStats, interfaceLanguage: string): Promise<RawDrillItem[]> {
  const ruleBlock = [
    `Title: ${rule.title}`,
    `Type: ${rule.type}`,
    rule.description ? `Description: ${rule.description}` : '',
    rule.formula ? `Formula: ${rule.formula}` : '',
    rule.examples?.length ? `Examples: ${rule.examples.join(' | ')}` : '',
    rule.aiContext ? `Extra context: ${rule.aiContext}` : '',
  ].filter(Boolean).join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: `You generate flashcard drill items for language learners. Return ONLY a valid JSON array, no markdown.

Each item: { "prompt": "<word or short phrase>", "choices": ["option1", "option2", ...], "correctAnswer": "<one of the choices>" }

Rules:
- For gerund/infinitive patterns: prompt = an English verb (e.g. "enjoy"), choices = ["doing", "to do"], correctAnswer = whichever form that verb requires
- For countable/uncountable/article patterns: prompt = a noun (e.g. "water"), choices = ["a", "an", "some", "—"], correctAnswer = the natural article/determiner
- For other collocation patterns: derive appropriate prompt/choices from the rule
- 15–25 items, no duplicates
- The user's interface language is ${interfaceLanguage} — write any explanatory text in that language, but keep prompts/choices in the target language`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Generate drill items for this grammar rule:\n\n${ruleBlock}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const items = JSON.parse(cleaned) as RawDrillItem[]
    return items.filter(
      item =>
        typeof item.prompt === 'string' &&
        Array.isArray(item.choices) &&
        item.choices.length >= 2 &&
        typeof item.correctAnswer === 'string' &&
        item.choices.includes(item.correctAnswer)
    )
  } catch {
    return []
  }
}