import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { vocabulary } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { parseVocabulary } from '@/lib/vocabulary/parser'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { languageId, format, content } = await request.json()
  if (!languageId || !content) {
    return NextResponse.json({ error: 'languageId and content required' }, { status: 400 })
  }

  const parsed = parseVocabulary(content, format ?? 'auto')
  if (parsed.length === 0) {
    return NextResponse.json({ error: 'No valid entries found' }, { status: 400 })
  }

  // Fetch existing words to skip duplicates
  const existing = await db
    .select({ word: vocabulary.word })
    .from(vocabulary)
    .where(and(eq(vocabulary.languageId, languageId), eq(vocabulary.userId, user.id)))

  const existingWords = new Set(existing.map(e => e.word.toLowerCase()))

  const toInsert = parsed.filter(p => !existingWords.has(p.word.toLowerCase()))

  if (toInsert.length === 0) {
    return NextResponse.json({ imported: 0, skipped: parsed.length })
  }

  const inserted = await db.insert(vocabulary).values(
    toInsert.map(p => ({
      languageId,
      userId: user.id,
      word: p.word,
      translation: p.translation,
      context: p.context ?? null,
    }))
  ).returning()

  return NextResponse.json({ imported: toInsert.length, skipped: parsed.length - toInsert.length })
}