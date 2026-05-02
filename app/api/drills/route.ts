import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { rules, drillItems } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const languageId = request.nextUrl.searchParams.get('languageId')
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 })

  const [rulesRows, itemRows] = await Promise.all([
    db
      .select({ id: rules.id, title: rules.title })
      .from(rules)
      .where(and(eq(rules.languageId, languageId), eq(rules.userId, user.id), eq(rules.archived, false))),
    db
      .select({ ruleId: drillItems.ruleId, nextReview: drillItems.nextReview })
      .from(drillItems)
      .where(and(eq(drillItems.languageId, languageId), eq(drillItems.userId, user.id))),
  ])

  const now = new Date()
  const totalMap = new Map<string, number>()
  const dueMap = new Map<string, number>()

  for (const item of itemRows) {
    totalMap.set(item.ruleId, (totalMap.get(item.ruleId) ?? 0) + 1)
    if (new Date(item.nextReview) <= now) {
      dueMap.set(item.ruleId, (dueMap.get(item.ruleId) ?? 0) + 1)
    }
  }

  const result = rulesRows.map(r => ({
    ruleId: r.id,
    title: r.title,
    totalItems: totalMap.get(r.id) ?? 0,
    dueItems: dueMap.get(r.id) ?? 0,
  }))

  return NextResponse.json(result)
}