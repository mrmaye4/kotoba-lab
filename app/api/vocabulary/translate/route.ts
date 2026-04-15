import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { languages } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { word, languageId } = await request.json()
    if (!word?.trim() || !languageId) {
      return NextResponse.json({ error: 'word and languageId required' }, { status: 400 })
    }

    const [lang] = await db
      .select({ name: languages.name })
      .from(languages)
      .where(and(eq(languages.id, languageId), eq(languages.userId, user.id)))

    if (!lang) return NextResponse.json({ error: 'Language not found' }, { status: 404 })

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Translate the ${lang.name} word/phrase "${word.trim()}" into English.
Return ONLY valid JSON, no markdown:
{"translation": "<English translation>", "example": "<short example sentence in ${lang.name} using this word>"}`,
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result = JSON.parse(cleaned)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[vocabulary/translate]', err)
    return NextResponse.json({ error: 'Failed to translate' }, { status: 500 })
  }
}