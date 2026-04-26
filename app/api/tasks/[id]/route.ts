import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { tasks, sessions, ruleStats } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { calculateNextReview } from '@/lib/vocabulary/sm2'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: taskId } = await params
  const { score, feedback, isCorrect } = await request.json()

  if (typeof score !== 'number' || score < 0 || score > 10) {
    return NextResponse.json({ error: 'score must be 0-10' }, { status: 400 })
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify ownership via session
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, task.sessionId), eq(sessions.userId, user.id)))
    .limit(1)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const newIsCorrect = typeof isCorrect === 'boolean' ? isCorrect : score >= 7
  const newFeedback = feedback ?? (newIsCorrect ? 'Marked as correct manually.' : task.feedback)

  await db
    .update(tasks)
    .set({ score, feedback: newFeedback, isCorrect: newIsCorrect })
    .where(eq(tasks.id, taskId))

  // Re-apply EMA to ruleStats with the overridden score
  if (task.ruleId) {
    const [stats] = await db
      .select()
      .from(ruleStats)
      .where(and(eq(ruleStats.ruleId, task.ruleId), eq(ruleStats.userId, user.id)))
      .limit(1)

    if (stats) {
      const newEma = 0.3 * (score / 10) + 0.7 * stats.emaScore
      const q = score < 4 ? 0 : score < 6 ? 2 : score < 8 ? 4 : 5
      const sm2 = calculateNextReview(
        { easeFactor: stats.easeFactor, interval: stats.interval, repetitions: stats.repetitions },
        q
      )
      const nextReview = new Date()
      nextReview.setDate(nextReview.getDate() + sm2.interval)

      await db
        .update(ruleStats)
        .set({
          emaScore: newEma,
          weakFlag: newEma < 0.6,
          interval: sm2.interval,
          repetitions: sm2.repetitions,
          easeFactor: sm2.easeFactor,
          nextReview,
          updatedAt: new Date(),
        })
        .where(eq(ruleStats.id, stats.id))
    }
  }

  // Recalculate session avgScore
  const allTasks = await db
    .select({ score: tasks.score })
    .from(tasks)
    .where(eq(tasks.sessionId, session.id))
  const scores = allTasks.map(t => t.score).filter((s): s is number => s !== null)
  const newAvg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  await db.update(sessions).set({ avgScore: newAvg }).where(eq(sessions.id, session.id))

  return NextResponse.json({ score, feedback: newFeedback, isCorrect: newIsCorrect })
}