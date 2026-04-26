import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { optimizationSessions, optimizationGroups, rules, languages } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { generateMergedRule } from '@/lib/optimize/merging'
import { getInterfaceLanguage } from '@/lib/user-settings'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sessionId } = await params

    const [session] = await db
      .select()
      .from(optimizationSessions)
      .where(and(eq(optimizationSessions.id, sessionId), eq(optimizationSessions.userId, user.id)))
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [lang] = await db
      .select({ name: languages.name })
      .from(languages)
      .where(eq(languages.id, session.languageId))

    const groups = await db
      .select()
      .from(optimizationGroups)
      .where(and(
        eq(optimizationGroups.sessionId, sessionId),
        eq(optimizationGroups.excluded, false),
      ))

    const allRuleIds = [...new Set(groups.flatMap(g => g.sourceRuleIds))]
    const sourceRules = allRuleIds.length > 0
      ? await db
          .select({
            id: rules.id, title: rules.title, description: rules.description,
            formula: rules.formula, type: rules.type, aiContext: rules.aiContext,
            difficulty: rules.difficulty, examples: rules.examples,
          })
          .from(rules)
          .where(inArray(rules.id, allRuleIds))
      : []
    const rulesById = Object.fromEntries(sourceRules.map(r => [r.id, r]))

    const interfaceLanguage = await getInterfaceLanguage(user.id)

    await db.update(optimizationSessions)
      .set({ status: 'generating' })
      .where(eq(optimizationSessions.id, sessionId))

    await Promise.all(groups.map(async (group) => {
      try {
        await db.update(optimizationGroups)
          .set({ generationStatus: 'generating' })
          .where(eq(optimizationGroups.id, group.id))

        const groupRules = group.sourceRuleIds
          .map(id => rulesById[id])
          .filter(Boolean) as typeof sourceRules

        const merged = await generateMergedRule(group.name, groupRules, lang?.name ?? 'Unknown', interfaceLanguage)

        await db.update(optimizationGroups).set({
          mergedTitle: merged.title,
          mergedDescription: merged.description,
          mergedFormula: merged.formula,
          mergedType: merged.type,
          mergedAiContext: merged.aiContext,
          mergedDifficulty: merged.difficulty,
          mergedExamples: merged.examples,
          generationStatus: 'done',
        }).where(eq(optimizationGroups.id, group.id))
      } catch {
        await db.update(optimizationGroups)
          .set({ generationStatus: 'error' })
          .where(eq(optimizationGroups.id, group.id))
      }
    }))

    await db.update(optimizationSessions)
      .set({ status: 'ready' })
      .where(eq(optimizationSessions.id, sessionId))

    const updatedGroups = await db
      .select()
      .from(optimizationGroups)
      .where(eq(optimizationGroups.sessionId, sessionId))

    return NextResponse.json({ groups: updatedGroups })
  } catch (err) {
    console.error('[optimize/generate]', err)
    return NextResponse.json({ error: 'Failed to generate' }, { status: 500 })
  }
}
