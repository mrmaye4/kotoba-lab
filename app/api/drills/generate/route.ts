import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { rules, ruleStats, ruleCategoryLinks, drillItems } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { generateDrillItems } from '@/lib/claude/drills'
import { getInterfaceLanguage } from '@/lib/user-settings'
import type { RuleWithStats } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ruleId } = await request.json()
  if (!ruleId) return NextResponse.json({ error: 'ruleId required' }, { status: 400 })

  const [ruleRow] = await db
    .select({
      id: rules.id,
      languageId: rules.languageId,
      title: rules.title,
      description: rules.description,
      formula: rules.formula,
      type: rules.type,
      aiContext: rules.aiContext,
      difficulty: rules.difficulty,
      examples: rules.examples,
      emaScore: ruleStats.emaScore,
      weakFlag: ruleStats.weakFlag,
      nextReview: ruleStats.nextReview,
    })
    .from(rules)
    .leftJoin(ruleStats, eq(rules.id, ruleStats.ruleId))
    .where(and(eq(rules.id, ruleId), eq(rules.userId, user.id)))
    .limit(1)

  if (!ruleRow) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })

  const linkRows = await db
    .select({ categoryId: ruleCategoryLinks.categoryId })
    .from(ruleCategoryLinks)
    .where(eq(ruleCategoryLinks.ruleId, ruleId))

  const rule: RuleWithStats = {
    ...ruleRow,
    categoryIds: linkRows.map(l => l.categoryId),
    emaScore: ruleRow.emaScore ?? null,
    weakFlag: ruleRow.weakFlag ?? null,
    nextReview: ruleRow.nextReview ? ruleRow.nextReview.toISOString() : null,
  }

  const interfaceLanguage = await getInterfaceLanguage(user.id)
  const generated = await generateDrillItems(rule, interfaceLanguage)

  if (generated.length === 0) {
    return NextResponse.json({ error: 'Generation returned no valid items' }, { status: 500 })
  }

  // Idempotent: delete existing items for this rule, then insert new ones
  await db.delete(drillItems).where(and(eq(drillItems.ruleId, ruleId), eq(drillItems.userId, user.id)))

  await db.insert(drillItems).values(
    generated.map(item => ({
      ruleId,
      languageId: ruleRow.languageId,
      userId: user.id,
      prompt: item.prompt,
      choices: item.choices,
      correctAnswer: item.correctAnswer,
    }))
  )

  return NextResponse.json({ count: generated.length })
}