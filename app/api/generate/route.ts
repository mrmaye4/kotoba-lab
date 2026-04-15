import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { rules, ruleStats, vocabulary, tasks, sessions, languages } from '@/lib/db/schema'
import { eq, and, inArray, asc } from 'drizzle-orm'
import { generateTasks, generateTheme } from '@/lib/claude/generate'
import { getInterfaceLanguage } from '@/lib/user-settings'
import type { SessionMode } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, languageId, ruleIds, includeVocab, useTheme, allowedTypes, difficulty } = await request.json()

  if (!sessionId || !languageId || !ruleIds?.length) {
    return NextResponse.json({ error: 'sessionId, languageId, ruleIds required' }, { status: 400 })
  }

  // Get session
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
    .limit(1)

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const mode: SessionMode = (session.mode as SessionMode) ?? 'practice'
  const interfaceLanguage = await getInterfaceLanguage(user.id)

  // Get language name
  const [lang] = await db
    .select({ name: languages.name, minRuleInterval: languages.minRuleInterval })
    .from(languages)
    .where(eq(languages.id, languageId))
    .limit(1)
  const languageName = lang?.name ?? 'Unknown'

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

  // Get vocabulary if needed — 40 worst-known words (lowest ease factor first)
  let vocabItems: Array<{ word: string; translation: string; context: string | null }> = []
  if (includeVocab) {
    vocabItems = await db
      .select({ word: vocabulary.word, translation: vocabulary.translation, context: vocabulary.context })
      .from(vocabulary)
      .where(and(eq(vocabulary.languageId, languageId), eq(vocabulary.userId, user.id)))
      .orderBy(asc(vocabulary.easeFactor), asc(vocabulary.nextReview))
      .limit(40)
  }

  // Generate theme if requested (chaos always gets a theme)
  let theme: string | null = null
  const shouldUseTheme = useTheme || mode === 'chaos'
  if (shouldUseTheme) {
    theme = await generateTheme(languageName, rulesWithStats)
  }

  // Generate tasks
  const { tasks: generated, theme: finalTheme } = await generateTasks({
    rules: rulesWithStats,
    vocabulary: vocabItems,
    taskCount: session.totalTasks,
    language: languageName,
    mode,
    theme,
    interfaceLanguage,
    allowedTypes: allowedTypes?.length ? allowedTypes : undefined,
    difficulty: difficulty ?? 'any',
  })

  // Save theme to session if generated
  if (finalTheme) {
    await db
      .update(sessions)
      .set({ theme: finalTheme })
      .where(eq(sessions.id, sessionId))
  }

  // Insert tasks
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

  return NextResponse.json({ tasks: inserted, theme: finalTheme })
}