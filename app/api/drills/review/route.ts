import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { drillItems } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { calculateNextReview } from '@/lib/vocabulary/sm2'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, correct } = await request.json()
  if (!id || correct === undefined) {
    return NextResponse.json({ error: 'id and correct required' }, { status: 400 })
  }

  const [item] = await db
    .select()
    .from(drillItems)
    .where(and(eq(drillItems.id, id), eq(drillItems.userId, user.id)))
    .limit(1)

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // correct=true → q=4 (Good), correct=false → q=0 (Again)
  const q = correct ? 4 : 0
  const result = calculateNextReview(
    { easeFactor: item.easeFactor, interval: item.interval, repetitions: item.repetitions },
    q
  )

  const [updated] = await db
    .update(drillItems)
    .set({
      easeFactor: result.easeFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      nextReview: result.nextReview,
    })
    .where(eq(drillItems.id, id))
    .returning()

  return NextResponse.json(updated)
}