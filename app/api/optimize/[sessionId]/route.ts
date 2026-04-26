import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { optimizationSessions, optimizationGroups, rules } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

export async function GET(
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

  const groups = await db
    .select()
    .from(optimizationGroups)
    .where(eq(optimizationGroups.sessionId, sessionId))

  const allRuleIds = [...new Set(groups.flatMap(g => g.sourceRuleIds))]
  const sourceRules = allRuleIds.length > 0
    ? await db
        .select({ id: rules.id, title: rules.title, type: rules.type, difficulty: rules.difficulty })
        .from(rules)
        .where(inArray(rules.id, allRuleIds))
    : []

  const rulesById = Object.fromEntries(sourceRules.map(r => [r.id, r]))

  return NextResponse.json({
    session,
    groups: groups.map(g => ({
      ...g,
      sourceRules: g.sourceRuleIds.map(id => rulesById[id]).filter(Boolean),
    })),
    ungroupedRules: sourceRules.filter(r =>
      !groups.some(g => g.sourceRuleIds.includes(r.id))
    ),
  })
}