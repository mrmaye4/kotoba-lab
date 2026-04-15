import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { sessions, tasks } from '@/lib/db/schema'
import { eq, and, isNotNull } from 'drizzle-orm'

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<'/api/sessions/[id]/complete'>
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, user.id)))
    .limit(1)

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Calculate avg from answered tasks
  const answeredTasks = await db
    .select({ score: tasks.score, isCorrect: tasks.isCorrect })
    .from(tasks)
    .where(and(eq(tasks.sessionId, id), isNotNull(tasks.score)))

  const scores = answeredTasks.map(t => t.score).filter((s): s is number => s !== null)
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  await db
    .update(sessions)
    .set({
      status: 'completed',
      completed: scores.length,
      avgScore,
    })
    .where(eq(sessions.id, id))

  return NextResponse.json({ ok: true })
}