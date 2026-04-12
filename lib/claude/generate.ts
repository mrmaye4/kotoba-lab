import Anthropic from '@anthropic-ai/sdk'
import type { TaskType, RuleWithStats } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Task type weights — open_write is most common
const TASK_WEIGHTS: Record<TaskType, number> = {
  open_write: 30,
  fill_blank: 20,
  transform: 15,
  translate: 15,
  mcq: 10,
  error_find: 5,
  vocabulary: 5,
}

function pickWeighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function pickTaskType(includeVocab: boolean): TaskType {
  const entries = Object.entries(TASK_WEIGHTS) as [TaskType, number][]
  const filtered = includeVocab ? entries : entries.filter(([t]) => t !== 'vocabulary')
  return pickWeighted(
    filtered.map(([t]) => t),
    filtered.map(([, w]) => w)
  )
}

function pickRule(rules: RuleWithStats[]): RuleWithStats {
  // Weight = 1 - ema_score → weaker rules appear more
  const weights = rules.map(r => Math.max(0.1, 1 - (r.emaScore ?? 0.5)))
  return pickWeighted(rules, weights)
}

type GenerateInput = {
  rules: RuleWithStats[]
  vocabulary: Array<{ word: string; translation: string; context: string | null }>
  taskCount: number
  language: string
}

type GeneratedTask = {
  rule_id: string
  type: TaskType
  prompt: string
  options?: string[]
  correct_answer?: string
  ai_check_context?: string
}

export async function generateTasks({
  rules,
  vocabulary,
  taskCount,
  language,
}: GenerateInput): Promise<GeneratedTask[]> {
  const includeVocab = vocabulary.length > 0

  // Pre-select types and rules for each task
  const plan = Array.from({ length: taskCount }, () => {
    const rule = pickRule(rules)
    const type = pickTaskType(includeVocab)
    return { rule, type }
  })

  const rulesText = rules
    .map(r => {
      const weak = (r.emaScore ?? 0.5) < 0.6 ? ' ⚠️ (слабое правило — больше задач)' : ''
      const parts = [
        `ID: ${r.id}`,
        `Название: ${r.title}${weak}`,
        r.description ? `Описание: ${r.description}` : '',
        r.formula ? `Формула: ${r.formula}` : '',
        r.examples?.length ? `Примеры: ${r.examples.join(' | ')}` : '',
        r.aiContext ? `Доп. контекст: ${r.aiContext}` : '',
      ].filter(Boolean)
      return parts.join('\n')
    })
    .join('\n\n')

  const vocabText =
    includeVocab
      ? '\n\nСЛОВА ДЛЯ ИСПОЛЬЗОВАНИЯ В ЗАДАНИЯХ (при типе vocabulary):\n' +
        vocabulary
          .slice(0, 30)
          .map(v => `${v.word} — ${v.translation}${v.context ? ` (${v.context})` : ''}`)
          .join('\n')
      : ''

  const planText = plan
    .map(
      (p, i) =>
        `Задание ${i + 1}: тип=${p.type}, rule_id=${p.rule.id} (${p.rule.title})`
    )
    .join('\n')

  const systemPrompt = `Ты — языковой репетитор. Генерируешь задания для изучения языка.
Возвращай ТОЛЬКО валидный JSON массив, без markdown, без пояснений.

Типы заданий:
- mcq: 4 варианта ответа (A/B/C/D), один правильный
- fill_blank: вставить слово/форму в пробел "___"
- transform: переписать предложение по правилу
- open_write: свободно написать 1-2 предложения используя правило
- vocabulary: вставить слово по смыслу
- error_find: найти и исправить ошибку в предложении
- translate: перевести предложение на ${language}

Каждый объект в массиве:
{
  "rule_id": "<id правила>",
  "type": "<тип>",
  "prompt": "<задание для студента, на русском>",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],  // только для mcq
  "correct_answer": "<ответ>",  // для mcq (буква A/B/C/D), fill_blank, vocabulary
  "ai_check_context": "<что ожидается в ответе, для проверки ИИ>"
}

Важно: не указывай название правила в тексте задания.`

  const userMessage = `Язык изучения: ${language}

ПРАВИЛА:
${rulesText}${vocabText}

ПЛАН ЗАДАНИЙ (следуй ему):
${planText}

Сгенерируй ${taskCount} заданий согласно плану. Верни JSON массив.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Strip markdown code blocks if present
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  const parsed: GeneratedTask[] = JSON.parse(cleaned)
  return parsed
}