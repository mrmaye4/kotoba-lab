import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { rules, ruleStats, vocabulary, tasks, sessions } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { generateTasks } from '@/lib/claude/generate'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, languageId, ruleIds, includeVocab } = await request.json()

  if (!sessionId || !languageId || !ruleIds?.length) {
    return NextResponse.json({ error: 'sessionId, languageId, ruleIds required' }, { status: 400 })
  }

  // Get session to know task count
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
    .limit(1)

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Get language name from first rule's language
  const [langRule] = await db
    .select({ name: rules.title })
    .from(rules)
    .where(eq(rules.languageId, languageId))
    .limit(1)

  // Get rules with stats
  const rulesWithStats = await db
    .select({
      id: rules.id,
      title: rules.title,
      description: rules.description,
      formula: rules.formula,
      type: rules.type,
      aiContext: rules.aiContext,
      difficulty: rules.difficulty,
      examples: rules.examples,
      emaScore: ruleStats.emaScore,
      weakFlag: ruleStats.weakFlag,
    })
    .from(rules)
    .leftJoin(ruleStats, eq(rules.id, ruleStats.ruleId))
    .where(and(inArray(rules.id, ruleIds), eq(rules.userId, user.id)))

  // Get language name from languages table
  const { languages } = await import('@/lib/db/schema')
  const { db: dbClient } = await import('@/lib/db')
  const [lang] = await dbClient.select({ name: languages.name }).from(languages).where(eq(languages.id, languageId)).limit(1)
  const languageName = lang?.name ?? 'Unknown'

  // Get vocabulary if needed
  let vocabItems: Array<{ word: string; translation: string; context: string | null }> = []
  if (includeVocab) {
    vocabItems = await db
      .select({ word: vocabulary.word, translation: vocabulary.translation, context: vocabulary.context })
      .from(vocabulary)
      .where(and(eq(vocabulary.languageId, languageId), eq(vocabulary.userId, user.id)))
      .limit(50)
  }

  // Generate tasks via Claude
  const generated = await generateTasks({
    rules: rulesWithStats,
    vocabulary: vocabItems,
    taskCount: session.totalTasks,
    language: languageName,
  })

  // Insert tasks into DB
  const inserted = await db
    .insert(tasks)
    .values(
      generated.map(t => ({
        sessionId,
        ruleId: t.rule_id || null,
        type: t.type,
        prompt: t.prompt,
        options: t.options ?? null,
        correctAnswer: t.correct_answer ?? null,
        aiCheckContext: t.ai_check_context ?? null,
      }))
    )
    .returning()

  return NextResponse.json({ tasks: inserted })
}