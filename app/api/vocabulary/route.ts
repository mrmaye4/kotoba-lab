import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { vocabulary } from '@/lib/db/schema'
import { eq, and, lte } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const languageId = request.nextUrl.searchParams.get('languageId')
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 })

  const dueOnly = request.nextUrl.searchParams.get('due') === '1'

  let rows

  if (dueOnly) {
    rows = await db
      .select()
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.languageId, languageId),
          eq(vocabulary.userId, user.id),
          lte(vocabulary.nextReview, new Date())
        )
      )
  } else {
    rows = await db
      .select()
      .from(vocabulary)
      .where(and(eq(vocabulary.languageId, languageId), eq(vocabulary.userId, user.id)))
  }

  return NextResponse.json(rows)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { languageId, word, translation, context } = await request.json()
  if (!languageId || !word?.trim() || !translation?.trim()) {
    return NextResponse.json({ error: 'languageId, word and translation are required' }, { status: 400 })
  }

  const [entry] = await db
    .insert(vocabulary)
    .values({
      languageId,
      userId: user.id,
      word: word.trim(),
      translation: translation.trim(),
      context: context?.trim() || null,
    })
    .returning()

  return NextResponse.json(entry, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.delete(vocabulary).where(and(eq(vocabulary.id, id), eq(vocabulary.userId, user.id)))

  return NextResponse.json({ ok: true })
}