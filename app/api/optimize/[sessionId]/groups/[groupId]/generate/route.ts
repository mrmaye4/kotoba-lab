import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { optimizationSessions, optimizationGroups, rules, languages } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { generateMergedRule } from '@/lib/optimize/merging'
import { getInterfaceLanguage } from '@/lib/user-settings'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; groupId: string }> }
) {
  const { sessionId, groupId } = await params

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [session] = await db
      .select()
      .from(optimizationSessions)
      .where(and(eq(optimizationSessions.id, sessionId), eq(optimizationSessions.userId, user.id)))
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [group] = await db
      .select()
      .from(optimizationGroups)
      .where(and(eq(optimizationGroups.id, groupId), eq(optimizationGroups.sessionId, sessionId)))
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const [lang] = await db
      .select({ name: languages.name })
      .from(languages)
      .where(eq(languages.id, session.languageId))

    const sourceRules = group.sourceRuleIds.length > 0
      ? await db
          .select({
            id: rules.id, title: rules.title, description: rules.description,
            formula: rules.formula, type: rules.type, aiContext: rules.aiContext,
            difficulty: rules.difficulty, examples: rules.examples,
          })
          .from(rules)
          .where(inArray(rules.id, group.sourceRuleIds))
      : []

    await db.update(optimizationGroups)
      .set({ generationStatus: 'generating' })
      .where(eq(optimizationGroups.id, groupId))

    const interfaceLanguage = await getInterfaceLanguage(user.id)
    const merged = await generateMergedRule(group.name, sourceRules, lang?.name ?? 'Unknown', interfaceLanguage)

    const [updated] = await db.update(optimizationGroups).set({
      mergedTitle: merged.title,
      mergedDescription: merged.description,
      mergedFormula: merged.formula,
      mergedType: merged.type,
      mergedAiContext: merged.aiContext,
      mergedDifficulty: merged.difficulty,
      mergedExamples: merged.examples,
      generationStatus: 'done',
    }).where(eq(optimizationGroups.id, groupId)).returning()

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[optimize/groups/generate]', err)
    await db.update(optimizationGroups)
      .set({ generationStatus: 'error' })
      .where(eq(optimizationGroups.id, groupId))
      .catch(() => {})
    return NextResponse.json({ error: 'Failed to generate' }, { status: 500 })
  }
}
