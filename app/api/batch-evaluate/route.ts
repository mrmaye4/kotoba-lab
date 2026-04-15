import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { tasks, sessions, ruleStats, languages } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'
import { calculateNextReview } from '@/lib/vocabulary/sm2'
import { getInterfaceLanguage } from '@/lib/user-settings'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type EvalItem = { taskId: string; userAnswer: string }
type EvalResult = { taskId: string; score: number; feedback: string; isCorrect: boolean }

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, items }: { sessionId: string; items: EvalItem[] } = await request.json()
  if (!sessionId || !items?.length) {
    return NextResponse.json({ error: 'sessionId and items required' }, { status: 400 })
  }

  // Verify session ownership
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
    .limit(1)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Get language
  const [lang] = await db
    .select({ name: languages.name, minRuleInterval: languages.minRuleInterval })
    .from(languages)
    .where(eq(languages.id, session.languageId))
    .limit(1)
  const languageName = lang?.name ?? 'Unknown'
  const minInterval = lang?.minRuleInterval ?? 1
  const interfaceLanguage = await getInterfaceLanguage(user.id)

  // Filter to answered items only
  const answeredItems = items.filter(i => i.userAnswer.trim() !== '')
  if (!answeredItems.length) {
    return NextResponse.json({ error: 'No answers to evaluate' }, { status: 400 })
  }

  // Fetch tasks from DB
  const taskIds = answeredItems.map(i => i.taskId)
  const dbTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.sessionId, sessionId), inArray(tasks.id, taskIds)))

  if (!dbTasks.length) return NextResponse.json({ error: 'No tasks found' }, { status: 404 })

  const answerMap = Object.fromEntries(answeredItems.map(i => [i.taskId, i.userAnswer]))

  // Build batch evaluation prompt
  const TASK_TYPE_LABELS: Record<string, string> = {
    mcq: 'Multiple choice',
    fill_blank: 'Fill in the blank',
    transform: 'Transform',
    open_write: 'Free writing',
    vocabulary: 'Vocabulary',
    error_find: 'Find the error',
    translate: 'Translate',
  }

  const evalBlocks = dbTasks.map((t, i) => {
    const userAnswer = answerMap[t.id] ?? ''
    return `### Task ${i + 1} (id: "${t.id}")
Type: ${TASK_TYPE_LABELS[t.type] ?? t.type}
Prompt: ${t.prompt}${t.correctAnswer ? `\nExpected: ${t.correctAnswer}` : ''}${t.aiCheckContext ? `\nEvaluation context: ${t.aiCheckContext}` : ''}
Student answer: "${userAnswer}"`
  }).join('\n\n')

  const systemPrompt = `You are a strict but fair ${languageName} language teacher.
Evaluate each student answer. Return ONLY a valid JSON array, no markdown.

For each task return a JSON object with these exact keys:
- taskId: exact task id string from input (copy it exactly)
- score: integer 0–10
- feedback: 1–2 sentences in ${interfaceLanguage} explaining the score
- isCorrect: boolean, true if score >= 7

Scoring:
- 10: perfect
- 7–9: mostly correct, minor issues
- 4–6: partially correct, noticeable errors
- 1–3: mostly wrong but shows some understanding
- 0: no attempt or completely wrong`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Evaluate these ${dbTasks.length} answers:\n\n${evalBlocks}` }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawResults: any[] = JSON.parse(cleaned)
  // Normalise: Claude may return `id` or `taskId`
  const results: EvalResult[] = rawResults.map(r => ({
    taskId: r.taskId ?? r.id ?? '',
    score: typeof r.score === 'number' ? r.score : 0,
    feedback: r.feedback ?? '',
    isCorrect: typeof r.isCorrect === 'boolean' ? r.isCorrect : (r.score ?? 0) >= 7,
  }))
  const resultsMap = Object.fromEntries(results.filter(r => r.taskId).map(r => [r.taskId, r]))

  // Persist results to DB and update rule stats
  for (const dbTask of dbTasks) {
    const result = resultsMap[dbTask.id]
    const userAnswer = answerMap[dbTask.id] ?? ''
    if (!userAnswer.trim()) continue

    const score = result?.score ?? 0
    const feedback = result?.feedback ?? ''
    const isCorrect = result?.isCorrect ?? false

    await db
      .update(tasks)
      .set({ userAnswer, score, feedback, isCorrect })
      .where(eq(tasks.id, dbTask.id))

    if (dbTask.ruleId) {
      const [stats] = await db
        .select()
        .from(ruleStats)
        .where(and(eq(ruleStats.ruleId, dbTask.ruleId), eq(ruleStats.userId, user.id)))
        .limit(1)

      if (stats) {
        const newEma = 0.3 * (score / 10) + 0.7 * stats.emaScore
        const q = score < 4 ? 0 : score < 6 ? 2 : score < 8 ? 4 : 5
        const sm2 = calculateNextReview(
          { easeFactor: stats.easeFactor, interval: stats.interval, repetitions: stats.repetitions },
          q
        )
        const finalInterval = Math.max(minInterval, sm2.interval)
        const nextReview = new Date()
        nextReview.setDate(nextReview.getDate() + finalInterval)

        await db
          .update(ruleStats)
          .set({
            emaScore: newEma,
            attemptsTotal: stats.attemptsTotal + 1,
            weakFlag: newEma < 0.6,
            interval: finalInterval,
            repetitions: sm2.repetitions,
            easeFactor: sm2.easeFactor,
            nextReview,
            updatedAt: new Date(),
          })
          .where(eq(ruleStats.id, stats.id))
      }
    }
  }

  // Update session stats
  const answeredCount = answeredItems.length
  const scores = results.map(r => r.score)
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  await db
    .update(sessions)
    .set({
      completed: answeredCount,
      status: 'completed',
      avgScore,
    })
    .where(eq(sessions.id, sessionId))

  return NextResponse.json({ results, avgScore })
}