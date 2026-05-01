import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { drillItems } from '@/lib/db/schema'
import { eq, and, lte, inArray } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ruleIdsParam = request.nextUrl.searchParams.get('ruleIds')
  const mode = request.nextUrl.searchParams.get('mode') ?? 'due'

  if (!ruleIdsParam) return NextResponse.json({ error: 'ruleIds required' }, { status: 400 })

  const ruleIds = ruleIdsParam.split(',').filter(Boolean)

  const baseCondition = and(
    eq(drillItems.userId, user.id),
    inArray(drillItems.ruleId, ruleIds)
  )

  const condition = mode === 'due'
    ? and(baseCondition, lte(drillItems.nextReview, new Date()))
    : baseCondition

  const items = await db
    .select()
    .from(drillItems)
    .where(condition)

  // Shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }

  return NextResponse.json(items)
}