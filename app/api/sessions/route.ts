import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { sessions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, user.id))

  return NextResponse.json(rows)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { languageId, ruleIds, taskCount, includeVocab, mode, paragraphCount } = await request.json()

  if (!languageId || !ruleIds?.length) {
    return NextResponse.json({ error: 'languageId and ruleIds required' }, { status: 400 })
  }

  const [session] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      languageId,
      ruleIds,
      status: 'active',
      mode: mode ?? 'practice',
      totalTasks: taskCount ?? 10,
      completed: 0,
      settings: {
        task_count: taskCount ?? 10,
        include_vocab: includeVocab ?? false,
        ...(paragraphCount ? { paragraph_count: paragraphCount } : {}),
      },
    })
    .returning()

  return NextResponse.json(session, { status: 201 })
}