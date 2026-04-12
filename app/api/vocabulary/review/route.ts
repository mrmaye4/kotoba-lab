import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { vocabulary } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { calculateNextReview } from '@/lib/vocabulary/sm2'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // q: 0=Again, 2=Hard, 4=Good, 5=Easy
  const { id, q } = await request.json()
  if (!id || q === undefined) {
    return NextResponse.json({ error: 'id and q required' }, { status: 400 })
  }

  const [card] = await db
    .select()
    .from(vocabulary)
    .where(and(eq(vocabulary.id, id), eq(vocabulary.userId, user.id)))
    .limit(1)

  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = calculateNextReview(
    { easeFactor: card.easeFactor, interval: card.interval, repetitions: card.repetitions },
    q
  )

  const [updated] = await db
    .update(vocabulary)
    .set({
      easeFactor: result.easeFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      nextReview: result.nextReview,
    })
    .where(eq(vocabulary.id, id))
    .returning()

  return NextResponse.json(updated)
}