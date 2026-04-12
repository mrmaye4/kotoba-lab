import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { sessions, tasks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/sessions/[id]'>
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

  const sessionTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.sessionId, id))

  return NextResponse.json({ session, tasks: sessionTasks })
}