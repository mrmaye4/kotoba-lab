import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { vocabularyCategories } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const languageId = request.nextUrl.searchParams.get('languageId')
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 })

  const rows = await db
    .select()
    .from(vocabularyCategories)
    .where(and(eq(vocabularyCategories.languageId, languageId), eq(vocabularyCategories.userId, user.id)))

  return NextResponse.json(rows)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { languageId, name } = await request.json()
  if (!languageId || !name?.trim()) {
    return NextResponse.json({ error: 'languageId and name required' }, { status: 400 })
  }

  const [row] = await db
    .insert(vocabularyCategories)
    .values({ languageId, userId: user.id, name: name.trim() })
    .returning()

  return NextResponse.json(row, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db
    .delete(vocabularyCategories)
    .where(and(eq(vocabularyCategories.id, id), eq(vocabularyCategories.userId, user.id)))

  return NextResponse.json({ ok: true })
}