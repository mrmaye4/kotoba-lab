import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { vocabulary } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { Apkg } from 'anki-apkg-parser'

function stripHtml(str: string): string {
  return str
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

export async function POST(request: NextRequest) {
  let tmpFile: string | null = null
  let tmpDir: string | null = null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const languageId = formData.get('languageId') as string | null
    const file = formData.get('file') as File | null

    if (!languageId || !file) {
      return NextResponse.json({ error: 'languageId and file required' }, { status: 400 })
    }

    // Write uploaded file to a temp path so anki-apkg-parser can read it
    const id = randomUUID()
    tmpFile = join(tmpdir(), `${id}.apkg`)
    tmpDir = join(tmpdir(), `${id}-unpacked`)
    mkdirSync(tmpDir, { recursive: true })

    const apkgBytes = new Uint8Array(await file.arrayBuffer())
    writeFileSync(tmpFile, apkgBytes)

    // Unpack and open the deck
    let apkg: Apkg
    try {
      apkg = await Apkg.create(tmpFile, tmpDir)
    } catch {
      return NextResponse.json({ error: 'Invalid .apkg file' }, { status: 400 })
    }

    const ankiDb = await apkg.getDb()

    // Collection creation timestamp (seconds since epoch) — used to compute nextReview
    const colRow = await ankiDb.get('SELECT crt FROM col LIMIT 1') as { crt: number } | undefined
    const crt: number = colRow?.crt ?? 0

    // Fetch notes joined with their first card for scheduling data
    const rows = await ankiDb.all(`
      SELECT n.flds, c.ivl, c.factor, c.reps, c.due, c.type
      FROM notes n
      INNER JOIN cards c ON c.nid = n.id
      WHERE c.ord = 0
    `) as Array<{ flds: string; ivl: number; factor: number; reps: number; due: number; type: number }>

    if (rows.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0 })
    }

    // Fetch existing words for duplicate check
    const existing = await db
      .select({ word: vocabulary.word })
      .from(vocabulary)
      .where(and(eq(vocabulary.languageId, languageId), eq(vocabulary.userId, user.id)))
    const existingSet = new Set(existing.map(e => e.word.toLowerCase()))

    const toInsert: (typeof vocabulary.$inferInsert)[] = []
    let skipped = 0

    for (const row of rows) {
      // Anki fields are separated by the unit separator character \x1f
      const fields = row.flds.split('\x1f')
      const word = stripHtml(fields[0]?.trim() ?? '')
      const translation = stripHtml(fields[1]?.trim() ?? '')
      const context = fields[2] ? stripHtml(fields[2].trim()) || null : null

      if (!word || !translation) continue
      if (existingSet.has(word.toLowerCase())) { skipped++; continue }

      existingSet.add(word.toLowerCase())

      // Map Anki scheduling data to our SM-2 fields
      let interval = 1
      let repetitions = 0
      let easeFactor = 2.5
      let nextReview = new Date()

      if (row.type === 2 && row.ivl > 0) {
        // Review card: has real scheduling history
        interval = row.ivl
        repetitions = row.reps
        easeFactor = Math.max(1.3, row.factor / 1000)
        // due = number of days since collection creation
        nextReview = new Date((crt + row.due * 86400) * 1000)
      }
      // type 0/1/3 (new / learning / relearning): leave defaults, due immediately

      toInsert.push({
        languageId,
        userId: user.id,
        word,
        translation,
        context,
        interval,
        repetitions,
        easeFactor,
        nextReview,
      })
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ imported: 0, skipped })
    }

    // Insert in batches of 200 to avoid DB limits
    const BATCH = 200
    const inserted: (typeof vocabulary.$inferSelect)[] = []
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const rows = await db.insert(vocabulary).values(toInsert.slice(i, i + BATCH)).returning()
      inserted.push(...rows)
    }

    return NextResponse.json({ imported: inserted.length, skipped })
  } catch (err) {
    console.error('[import-apkg]', err)
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 })
  } finally {
    // Clean up temp files
    try { if (tmpFile) rmSync(tmpFile) } catch { /* ignore */ }
    try { if (tmpDir) rmSync(tmpDir, { recursive: true }) } catch { /* ignore */ }
  }
}