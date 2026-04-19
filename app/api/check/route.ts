import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { tasks, sessions, ruleStats } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { evaluateAnswer } from '@/lib/claude/evaluate'
import { calculateNextReview } from '@/lib/vocabulary/sm2'
import { getInterfaceLanguage } from '@/lib/user-settings'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taskId, userAnswer } = await request.json()
  if (!taskId || userAnswer === undefined) {
    return NextResponse.json({ error: 'taskId and userAnswer required' }, { status: 400 })
  }

  // Get task
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1)

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // Get session
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, task.sessionId))
    .limit(1)

  // Evaluate
  const interfaceLanguage = await getInterfaceLanguage(user.id)
  const { score, feedback, isCorrect } = await evaluateAnswer({
    type: task.type,
    prompt: task.prompt,
    correctAnswer: task.correctAnswer,
    aiCheckContext: task.aiCheckContext,
    userAnswer,
    interfaceLanguage,
  })

  // Update task
  await db
    .update(tasks)
    .set({ userAnswer, score, feedback, isCorrect })
    .where(eq(tasks.id, taskId))

  // Update rule_stats if task has a rule
  if (task.ruleId) {
    const [stats] = await db
      .select()
      .from(ruleStats)
      .where(and(eq(ruleStats.ruleId, task.ruleId), eq(ruleStats.userId, user.id)))
      .limit(1)

    if (stats) {
      // EMA update
      const newEma = 0.3 * (score / 10) + 0.7 * stats.emaScore

      // SM-2: map score 0-10 → q 0-5
      const q = score < 4 ? 0 : score < 6 ? 2 : score < 8 ? 4 : 5

      const sm2 = calculateNextReview(
        { easeFactor: stats.easeFactor, interval: stats.interval, repetitions: stats.repetitions },
        q
      )
      const finalInterval = sm2.interval
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

  // Update session completed count
  if (session) {
    const newCompleted = session.completed + 1
    const isFinished = newCompleted >= session.totalTasks

    // Calculate avg score from all answered tasks
    const answeredTasks = await db
      .select({ score: tasks.score })
      .from(tasks)
      .where(and(eq(tasks.sessionId, session.id), eq(tasks.isCorrect, tasks.isCorrect)))

    const scores = answeredTasks.map(t => t.score).filter((s): s is number => s !== null)
    const newAvg = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null

    await db
      .update(sessions)
      .set({
        completed: newCompleted,
        status: isFinished ? 'completed' : 'active',
        avgScore: newAvg,
      })
      .where(eq(sessions.id, session.id))
  }

  return NextResponse.json({ score, feedback, isCorrect })
}