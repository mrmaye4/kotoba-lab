import Anthropic from '@anthropic-ai/sdk'
import type { TaskType, SessionMode, DifficultyLevel, RuleWithStats } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Mastery-based task type selection (item 1)
// EMA 0-1: lower = weaker rule, higher = stronger mastery
// allowedTypes: if provided, only pick from this subset
function pickTaskType(ema: number, includeVocab: boolean, allowedTypes?: TaskType[]): TaskType {
  let weights: [TaskType, number][]

  if (ema < 0.3) {
    // New / very weak: structured tasks with clear right/wrong
    weights = [['mcq', 45], ['fill_blank', 35], ['vocabulary', 10], ['translate', 10]]
  } else if (ema < 0.6) {
    // Weak: mix of structured and production
    weights = [['fill_blank', 30], ['transform', 25], ['translate', 20], ['mcq', 15], ['open_write', 10]]
  } else if (ema < 0.8) {
    // Medium: more production
    weights = [['transform', 25], ['open_write', 25], ['translate', 20], ['fill_blank', 20], ['error_find', 10]]
  } else {
    // Strong: challenging production
    weights = [['open_write', 35], ['error_find', 25], ['translate', 25], ['transform', 15]]
  }

  let filtered = includeVocab ? weights : weights.filter(([t]) => t !== 'vocabulary')

  // Apply user-defined type filter
  if (allowedTypes && allowedTypes.length > 0) {
    const allowed = filtered.filter(([t]) => allowedTypes.includes(t))
    if (allowed.length > 0) filtered = allowed
  }

  return pickWeighted(
    filtered.map(([t]) => t),
    filtered.map(([, w]) => w)
  )
}

/** Parse a JSON array from Claude's response, recovering partial output if truncated. */
function parseTaskArray(raw: string): GeneratedTask[] {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // Response was truncated — find the last complete object by scanning for "},"  or "}]"
    const start = cleaned.indexOf('[')
    if (start === -1) return []
    let depth = 0
    let lastCompleteEnd = -1
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i]
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) lastCompleteEnd = i
      }
    }
    if (lastCompleteEnd === -1) return []
    try {
      return JSON.parse(cleaned.slice(start, lastCompleteEnd + 1) + ']')
    } catch {
      return []
    }
  }
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

function pickRule(rules: RuleWithStats[]): RuleWithStats {
  const weights = rules.map(r => Math.max(0.1, 1 - (r.emaScore ?? 0.5)))
  return pickWeighted(rules, weights)
}

type VocabItem = { word: string; translation: string; context: string | null }

type GeneratedTask = {
  rule_id: string
  type: TaskType
  prompt: string
  options?: string[]
  correct_answer?: string
  ai_check_context?: string
}

// Generate a short contextual theme for all tasks in a session (item 6)
export async function generateTheme(language: string, rules: RuleWithStats[]): Promise<string> {
  const rulesSummary = rules.map(r => r.title).join(', ')
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: `Generate a short everyday scenario/theme for ${language} practice tasks that naturally incorporates these grammar concepts: ${rulesSummary}. Reply with ONLY the theme name, 3-6 words. Examples: "At the doctor's office", "Planning a vacation", "Weekend market visit", "Job interview preparation"`,
    }],
  })
  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : 'Daily life'
  return text.replace(/^["']|["']$/g, '').replace(/\.$/, '')
}

function buildRuleBlock(r: RuleWithStats): string {
  const weak = (r.emaScore ?? 0.5) < 0.6 ? ' ⚠️ (weak — needs more practice)' : ''
  return [
    `ID: ${r.id}`,
    `Title: ${r.title}${weak}`,
    `Type: ${r.type}`,
    `Difficulty: ${r.difficulty}/5`,
    r.description ? `Description: ${r.description}` : '',
    r.formula ? `Formula: ${r.formula}` : '',
    r.examples?.length ? `Examples: ${r.examples.join(' | ')}` : '',
    r.aiContext ? `Extra context: ${r.aiContext}` : '',
  ].filter(Boolean).join('\n')
}

const DIFFICULTY_NOTES: Record<DifficultyLevel, string> = {
  any: '',
  easy: '\n\nDIFFICULTY: EASY — use only simple, everyday sentences. Common vocabulary. Short sentences. No complex structures or edge cases.',
  medium: '\n\nDIFFICULTY: MEDIUM — moderate complexity. Mix of familiar and new patterns. Normal sentence length.',
  hard: '\n\nDIFFICULTY: HARD — complex sentences, nuanced or advanced usage, edge cases, academic or abstract context. Challenge the student.',
}

function buildSystemPrompt(language: string, theme: string | null, interfaceLanguage: string, difficulty: DifficultyLevel = 'any'): string {
  const themeNote = theme
    ? `\n\nSESSION THEME: "${theme}". All tasks MUST be set in this scenario/context. Make the prompts feel like they belong to this theme naturally.`
    : ''

  const langNote = interfaceLanguage !== 'en'
    ? `\n\nIMPORTANT: Write all task prompts, instructions, and option text in ${interfaceLanguage} (the student's native language). The target language to practice is still ${language}.`
    : ''

  const difficultyNote = DIFFICULTY_NOTES[difficulty] ?? ''

  return `You are a language tutor generating exercises for ${language} learners.
Return ONLY a valid JSON array, no markdown, no explanations.${themeNote}${langNote}${difficultyNote}

Task types:
- mcq: 4 answer options (A/B/C/D), one correct
- fill_blank: insert a word/form into the blank "___"
- transform: rewrite the sentence according to the rule
- open_write: freely write 1-2 sentences using the rule
- vocabulary: insert the word by meaning
- error_find: find and correct the error in the sentence
- translate: give the student a sentence in ${interfaceLanguage} and ask them to translate it into ${language}

Each rule has a Type and Difficulty (1–5):
- Type "rule": focus on correct grammatical form or structure
- Type "structure": focus on sentence construction patterns
- Type "collocation": focus on fixed word combinations and natural pairings
- Difficulty 1–2: simple sentences, common vocabulary
- Difficulty 3: moderate complexity
- Difficulty 4–5: complex sentences, nuanced usage, edge cases

Each object in the array:
{
  "rule_id": "<rule id>",
  "type": "<type>",
  "prompt": "<task instruction in ${interfaceLanguage}, NEVER include the answer>",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correct_answer": "<answer — for translate: the ${language} translation; for mcq: letter only>",
  "ai_check_context": "<evaluation notes for AI grader, do NOT repeat the answer in the prompt>"
}

Critical rules:
- NEVER include the correct answer in the prompt field
- For translate tasks: the prompt contains ONLY the source sentence to translate, nothing else
- Do not mention the rule name in the task text`
}

// Per-rule generation: single Claude call for one rule (item 3)
async function generateTasksForRule({
  rule,
  count,
  vocabulary,
  language,
  theme,
  interfaceLanguage,
  allowedTypes,
  difficulty = 'any',
}: {
  rule: RuleWithStats
  count: number
  vocabulary: VocabItem[]
  language: string
  theme: string | null
  interfaceLanguage: string
  allowedTypes?: TaskType[]
  difficulty?: DifficultyLevel
}): Promise<GeneratedTask[]> {
  const includeVocab = vocabulary.length > 0
  const ema = rule.emaScore ?? 0.5

  const plan = Array.from({ length: count }, () => ({
    type: pickTaskType(ema, includeVocab, allowedTypes),
  }))

  const vocabText = includeVocab
    ? '\n\nWORDS TO USE (for vocabulary type):\n' +
      vocabulary.slice(0, 30).map(v => `${v.word} — ${v.translation}${v.context ? ` (${v.context})` : ''}`).join('\n')
    : ''

  const planText = plan.map((p, i) => `Task ${i + 1}: type=${p.type}`).join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: [{ type: 'text', text: buildSystemPrompt(language, theme, interfaceLanguage, difficulty), cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Target language: ${language}

RULE:
${buildRuleBlock(rule)}${vocabText}

TASK PLAN:
${planText}

Generate ${count} task(s) for this rule. All tasks must have rule_id: "${rule.id}". Return a JSON array.`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return parseTaskArray(cleaned)
}

// Chaos mode: single call, tasks intentionally mix multiple rules (item 4)
async function generateChaosTasks({
  rules,
  vocabulary,
  taskCount,
  language,
  theme,
  interfaceLanguage,
  allowedTypes,
  difficulty = 'any',
}: {
  rules: RuleWithStats[]
  vocabulary: VocabItem[]
  taskCount: number
  language: string
  theme: string | null
  interfaceLanguage: string
  allowedTypes?: TaskType[]
  difficulty?: DifficultyLevel
}): Promise<GeneratedTask[]> {
  const includeVocab = vocabulary.length > 0

  const rulesText = rules.map(buildRuleBlock).join('\n\n')
  const vocabText = includeVocab
    ? '\n\nWORDS TO USE (for vocabulary type):\n' +
      vocabulary.slice(0, 60).map(v => `${v.word} — ${v.translation}${v.context ? ` (${v.context})` : ''}`).join('\n')
    : ''

  const plan = Array.from({ length: taskCount }, () => {
    const rule = pickRule(rules)
    const type = pickTaskType(rule.emaScore ?? 0.5, includeVocab, allowedTypes)
    return { rule, type }
  })

  const planText = plan
    .map((p, i) => `Task ${i + 1}: type=${p.type}, rule_id=${p.rule.id} (${p.rule.title})`)
    .join('\n')

  const chaosNote = `\n\nCHAOS MODE: Tasks intentionally test multiple grammar rules together. Some tasks should combine 2+ rules in a single exercise to increase challenge.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: [{ type: 'text', text: buildSystemPrompt(language, theme, interfaceLanguage, difficulty) + chaosNote, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Target language: ${language}

RULES:
${rulesText}${vocabText}

TASK PLAN (follow it — chaos mode mixes rules):
${planText}

Generate ${taskCount} tasks. Return a JSON array.`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return parseTaskArray(cleaned)
}

type GenerateInput = {
  rules: RuleWithStats[]
  vocabulary: VocabItem[]
  taskCount: number
  language: string
  mode: SessionMode
  theme: string | null
  interfaceLanguage: string
  allowedTypes?: TaskType[]
  difficulty?: DifficultyLevel
}

type GenerateOutput = {
  tasks: GeneratedTask[]
  theme: string | null
}

export async function generateTasks({
  rules,
  vocabulary,
  taskCount,
  language,
  mode,
  theme,
  interfaceLanguage,
  allowedTypes,
  difficulty = 'any',
}: GenerateInput): Promise<GenerateOutput> {
  if (mode === 'chaos') {
    const tasks = await generateChaosTasks({ rules, vocabulary, taskCount, language, theme, interfaceLanguage, allowedTypes, difficulty })
    return { tasks, theme }
  }

  // Practice / test mode: parallel per-rule generation (item 3)
  // Distribute tasks across rules proportionally to weakness
  const weights = rules.map(r => Math.max(0.1, 1 - (r.emaScore ?? 0.5)))
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  // Assign at least 1 task per rule, distribute remainder by weight
  const counts = rules.map(() => 1)
  let remaining = taskCount - rules.length
  if (remaining < 0) remaining = 0

  // Add extra tasks weighted by weakness
  for (let i = 0; i < remaining; i++) {
    let r = Math.random() * totalWeight
    for (let j = 0; j < rules.length; j++) {
      r -= weights[j]
      if (r <= 0) { counts[j]++; break }
    }
  }

  // If taskCount < rules.length, only use the weakest rules
  let activeRules = rules
  let activeCounts = counts
  if (taskCount < rules.length) {
    const sorted = rules
      .map((r, i) => ({ rule: r, weight: weights[i], idx: i }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, taskCount)
    activeRules = sorted.map(s => s.rule)
    activeCounts = sorted.map(() => 1)
  }

  // Sequential calls per rule to avoid concurrent connection rate limits
  const perRuleResults: GeneratedTask[][] = []
  for (let i = 0; i < activeRules.length; i++) {
    const result = await generateTasksForRule({
      rule: activeRules[i],
      count: activeCounts[i],
      vocabulary,
      language,
      theme,
      interfaceLanguage,
      allowedTypes,
      difficulty,
    })
    perRuleResults.push(result)
  }

  // Flatten and shuffle
  const allTasks = perRuleResults.flat()
  for (let i = allTasks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[allTasks[i], allTasks[j]] = [allTasks[j], allTasks[i]]
  }

  return { tasks: allTasks.slice(0, taskCount), theme }
}