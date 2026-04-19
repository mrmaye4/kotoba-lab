import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { rules, ruleStats } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const languageId = request.nextUrl.searchParams.get('languageId')
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 })

  const rows = await db
    .select({
      id: rules.id,
      categoryId: rules.categoryId,
      title: rules.title,
      description: rules.description,
      formula: rules.formula,
      type: rules.type,
      aiContext: rules.aiContext,
      difficulty: rules.difficulty,
      examples: rules.examples,
      createdAt: rules.createdAt,
      emaScore: ruleStats.emaScore,
      weakFlag: ruleStats.weakFlag,
      nextReview: ruleStats.nextReview,
    })
    .from(rules)
    .leftJoin(ruleStats, eq(rules.id, ruleStats.ruleId))
    .where(and(eq(rules.languageId, languageId), eq(rules.userId, user.id)))

  return NextResponse.json(rows)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { languageId, categoryId, title, description, formula, type, aiContext, difficulty, examples } = body

  if (!languageId || !title?.trim()) {
    return NextResponse.json({ error: 'languageId and title are required' }, { status: 400 })
  }

  const [rule] = await db
    .insert(rules)
    .values({
      languageId,
      userId: user.id,
      categoryId: categoryId || null,
      title: title.trim(),
      description: description || null,
      formula: formula || null,
      type: type || 'rule',
      aiContext: aiContext || null,
      difficulty: difficulty ?? 3,
      examples: examples || [],
    })
    .returning()

  // Create rule_stats entry (replaces DB trigger)
  await db.insert(ruleStats).values({
    ruleId: rule.id,
    userId: user.id,
    emaScore: 0.5,
    attemptsTotal: 0,
    weakFlag: false,
  })

  return NextResponse.json(rule, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, categoryId, title, description, formula, type, aiContext, difficulty, examples } = body

  if (!id || !title?.trim()) {
    return NextResponse.json({ error: 'id and title are required' }, { status: 400 })
  }

  const [rule] = await db
    .update(rules)
    .set({
      categoryId: categoryId || null,
      title: title.trim(),
      description: description || null,
      formula: formula || null,
      type: type || 'rule',
      aiContext: aiContext || null,
      difficulty: difficulty ?? 3,
      examples: examples || [],
    })
    .where(and(eq(rules.id, id), eq(rules.userId, user.id)))
    .returning()

  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(rule)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.delete(rules).where(and(eq(rules.id, id), eq(rules.userId, user.id)))

  return NextResponse.json({ ok: true })
}