import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { languages } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'
import { getInterfaceLanguage } from '@/lib/user-settings'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { hint, languageId } = await request.json()
    if (!hint?.trim() || !languageId) {
      return NextResponse.json({ error: 'hint and languageId required' }, { status: 400 })
    }

    const [lang] = await db
      .select({ name: languages.name })
      .from(languages)
      .where(and(eq(languages.id, languageId), eq(languages.userId, user.id)))

    if (!lang) return NextResponse.json({ error: 'Language not found' }, { status: 404 })

    const interfaceLanguage = await getInterfaceLanguage(user.id)

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `You are a language learning expert. Given a brief hint about a grammar rule or language pattern, generate a structured rule entry.
Return ONLY valid JSON, no markdown, no explanations:
{
  "title": "<concise rule name>",
  "type": "<rule|structure|collocation>",
  "difficulty": <1-5>,
  "description": "<1-2 sentence explanation>",
  "formula": "<structural formula or null if not applicable>",
  "examples": ["<example 1>", "<example 2>", "<example 3>"],
  "aiContext": "<additional hints for exercise generation, or null>"
}

Type guidance:
- "rule": grammatical rule (tenses, articles, prepositions)
- "structure": sentence construction pattern
- "collocation": fixed word combinations

Difficulty: 1=beginner, 2=elementary, 3=intermediate, 4=upper-intermediate, 5=advanced

IMPORTANT: Write title, description, formula, and aiContext in ${interfaceLanguage}. Examples should be in ${lang.name}. Formula uses linguistic notation (e.g. "have/has + V3").`,
      messages: [
        {
          role: 'user',
          content: `Language: ${lang.name}\nRule hint: ${hint.trim()}`,
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    const result = JSON.parse(cleaned)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[rules/suggest]', err)
    return NextResponse.json({ error: 'Failed to generate rule' }, { status: 500 })
  }
}