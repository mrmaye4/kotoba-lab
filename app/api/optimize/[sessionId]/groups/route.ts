import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { optimizationSessions, optimizationGroups } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params

  const [session] = await db
    .select()
    .from(optimizationSessions)
    .where(and(eq(optimizationSessions.id, sessionId), eq(optimizationSessions.userId, user.id)))
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const {
    groupId, name, sourceRuleIds, excluded,
    mergedTitle, mergedDescription, mergedFormula,
    mergedType, mergedAiContext, mergedDifficulty, mergedExamples,
  } = body

  if (!groupId) return NextResponse.json({ error: 'groupId required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (sourceRuleIds !== undefined) updates.sourceRuleIds = sourceRuleIds
  if (excluded !== undefined) updates.excluded = excluded
  if (mergedTitle !== undefined) updates.mergedTitle = mergedTitle
  if (mergedDescription !== undefined) updates.mergedDescription = mergedDescription
  if (mergedFormula !== undefined) updates.mergedFormula = mergedFormula
  if (mergedType !== undefined) updates.mergedType = mergedType
  if (mergedAiContext !== undefined) updates.mergedAiContext = mergedAiContext
  if (mergedDifficulty !== undefined) updates.mergedDifficulty = mergedDifficulty
  if (mergedExamples !== undefined) updates.mergedExamples = mergedExamples

  const [updated] = await db
    .update(optimizationGroups)
    .set(updates)
    .where(and(eq(optimizationGroups.id, groupId), eq(optimizationGroups.sessionId, sessionId)))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  return NextResponse.json(updated)
}