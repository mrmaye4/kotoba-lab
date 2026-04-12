import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { sessions, tasks, ruleStats, rules, vocabulary, languages } from '@/lib/db/schema'
import { eq, count, avg, lt, and, isNotNull, desc } from 'drizzle-orm'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    [{ totalSessions }],
    [{ avgScore }],
    [{ totalAnswered }],
    weakRules,
    recentSessions,
    userLanguages,
  ] = await Promise.all([
    db.select({ totalSessions: count() }).from(sessions).where(eq(sessions.userId, user.id)),

    db
      .select({ avgScore: avg(sessions.avgScore) })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), isNotNull(sessions.avgScore))),

    db
      .select({ totalAnswered: count() })
      .from(tasks)
      .innerJoin(sessions, eq(tasks.sessionId, sessions.id))
      .where(and(eq(sessions.userId, user.id), isNotNull(tasks.score))),

    db
      .select({
        emaScore: ruleStats.emaScore,
        attemptsTotal: ruleStats.attemptsTotal,
        ruleId: rules.id,
        ruleTitle: rules.title,
        languageId: rules.languageId,
      })
      .from(ruleStats)
      .innerJoin(rules, eq(ruleStats.ruleId, rules.id))
      .where(and(eq(ruleStats.userId, user.id), lt(ruleStats.emaScore, 0.6)))
      .orderBy(ruleStats.emaScore)
      .limit(20),

    db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id))
      .orderBy(desc(sessions.createdAt))
      .limit(10),

    db
      .select({ id: languages.id, name: languages.name, flagEmoji: languages.flagEmoji })
      .from(languages)
      .where(eq(languages.userId, user.id)),
  ])

  return NextResponse.json({
    totalSessions,
    avgScore: avgScore ? Number(avgScore) : null,
    totalAnswered,
    weakRules,
    recentSessions,
    languages: userLanguages,
  })
}