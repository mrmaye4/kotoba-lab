import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import {
  rules, languages,
  optimizationSessions, optimizationGroups,
  ruleCategoryLinks,
} from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { runGrouping } from '@/lib/optimize/grouping'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { languageId, filterCategoryId } = await request.json()
    if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 })

    const [lang] = await db
      .select({ name: languages.name })
      .from(languages)
      .where(and(eq(languages.id, languageId), eq(languages.userId, user.id)))
    if (!lang) return NextResponse.json({ error: 'Language not found' }, { status: 404 })

    let allRules = await db
      .select({
        id: rules.id,
        title: rules.title,
        description: rules.description,
        formula: rules.formula,
        type: rules.type,
        aiContext: rules.aiContext,
        difficulty: rules.difficulty,
        examples: rules.examples,
      })
      .from(rules)
      .where(and(eq(rules.languageId, languageId), eq(rules.userId, user.id), eq(rules.archived, false)))

    if (filterCategoryId) {
      const linkedRuleIds = await db
        .select({ ruleId: ruleCategoryLinks.ruleId })
        .from(ruleCategoryLinks)
        .where(eq(ruleCategoryLinks.categoryId, filterCategoryId))
      const linkedIds = new Set(linkedRuleIds.map(r => r.ruleId))
      allRules = allRules.filter(r => linkedIds.has(r.id))
    }

    if (allRules.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 rules to optimize' }, { status: 400 })
    }

    const [session] = await db.insert(optimizationSessions).values({
      languageId,
      userId: user.id,
      status: 'grouping',
      filterCategoryId: filterCategoryId ?? null,
      sourceRuleIds: allRules.map(r => r.id),
    }).returning()

    const groups = await runGrouping(
      allRules.map(r => ({ id: r.id, title: r.title, description: r.description, type: r.type })),
      lang.name
    )

    if (groups.length > 0) {
      await db.insert(optimizationGroups).values(
        groups.map(g => ({
          sessionId: session.id,
          name: g.name,
          sourceRuleIds: g.ruleIds,
        }))
      )
    }

    await db.update(optimizationSessions)
      .set({ status: 'grouped' })
      .where(eq(optimizationSessions.id, session.id))

    return NextResponse.json({ sessionId: session.id })
  } catch (err) {
    console.error('[optimize/start]', err)
    return NextResponse.json({ error: 'Failed to start optimization' }, { status: 500 })
  }
}