import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import {
  optimizationSessions, optimizationGroups,
  rules, ruleStats, ruleCategoryLinks,
} from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

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
    if (session.status === 'applied') return NextResponse.json({ error: 'Already applied' }, { status: 400 })

    const groups = await db
      .select()
      .from(optimizationGroups)
      .where(and(
        eq(optimizationGroups.sessionId, sessionId),
        eq(optimizationGroups.excluded, false),
      ))

    const activeGroups = groups.filter(g => g.mergedTitle)
    if (activeGroups.length === 0) return NextResponse.json({ error: 'No groups to apply' }, { status: 400 })

    const allSourceIds = [...new Set(activeGroups.flatMap(g => g.sourceRuleIds))]

    const [sourceStatsRows, sourceCategoryLinks] = await Promise.all([
      db.select().from(ruleStats).where(inArray(ruleStats.ruleId, allSourceIds)),
      db.select().from(ruleCategoryLinks).where(inArray(ruleCategoryLinks.ruleId, allSourceIds)),
    ])

    const statsById = Object.fromEntries(sourceStatsRows.map(s => [s.ruleId, s]))
    const categoryLinksByRuleId: Record<string, string[]> = {}
    for (const link of sourceCategoryLinks) {
      categoryLinksByRuleId[link.ruleId] = [...(categoryLinksByRuleId[link.ruleId] ?? []), link.categoryId]
    }

    await db.transaction(async (tx) => {
      for (const group of activeGroups) {
        const groupStats = group.sourceRuleIds.map(id => statsById[id]).filter(Boolean)
        const count = groupStats.length || 1
        const avgEmaScore = groupStats.reduce((s, r) => s + r.emaScore, 0) / count
        const avgEaseFactor = groupStats.reduce((s, r) => s + r.easeFactor, 0) / count
        const minInterval = Math.min(...groupStats.map(r => r.interval), 1)
        const avgRepetitions = Math.round(groupStats.reduce((s, r) => s + r.repetitions, 0) / count)
        const anyWeak = groupStats.some(r => r.weakFlag)

        const allCategoryIds = [...new Set(group.sourceRuleIds.flatMap(id => categoryLinksByRuleId[id] ?? []))]

        const [newRule] = await tx.insert(rules).values({
          languageId: session.languageId,
          userId: user.id,
          title: group.mergedTitle!,
          description: group.mergedDescription ?? null,
          formula: group.mergedFormula ?? null,
          type: (group.mergedType as 'rule' | 'structure' | 'collocation') ?? 'rule',
          aiContext: group.mergedAiContext ?? null,
          difficulty: group.mergedDifficulty ?? 3,
          examples: group.mergedExamples ?? [],
          archived: false,
        }).returning()

        await tx.insert(ruleStats).values({
          ruleId: newRule.id,
          userId: user.id,
          emaScore: avgEmaScore,
          attemptsTotal: 0,
          weakFlag: anyWeak,
          interval: minInterval,
          repetitions: avgRepetitions,
          easeFactor: avgEaseFactor,
        })

        if (allCategoryIds.length > 0) {
          await tx.insert(ruleCategoryLinks).values(
            allCategoryIds.map(categoryId => ({ ruleId: newRule.id, categoryId }))
          )
        }

        await tx.update(rules)
          .set({ archived: true })
          .where(inArray(rules.id, group.sourceRuleIds))
      }

      await tx.update(optimizationSessions)
        .set({ status: 'applied', appliedAt: new Date() })
        .where(eq(optimizationSessions.id, sessionId))
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[optimize/apply]', err)
    return NextResponse.json({ error: 'Failed to apply optimization' }, { status: 500 })
  }
}
