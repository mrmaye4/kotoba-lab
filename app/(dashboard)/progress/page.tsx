import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { sessions, tasks, ruleStats, rules, vocabulary, languages } from '@/lib/db/schema'
import { eq, count, avg, lt, and, isNotNull, desc, sql } from 'drizzle-orm'

function EmaBar({ score }: { score: number }) {
  const color = score >= 0.75 ? '#34d399' : score >= 0.5 ? '#fbbf24' : '#f87171'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score * 100}%`, background: color }} />
      </div>
      <span className="text-xs text-muted-foreground">{Math.round(score * 100)}%</span>
    </div>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground/50">—</span>
  const color = score >= 7 ? 'text-emerald-600 dark:text-emerald-400' : score >= 4 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'
  return <span className={`text-sm font-semibold ${color}`}>{score.toFixed(1)}</span>
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

export default async function ProgressPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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
      .select({
        id: languages.id,
        name: languages.name,
        flagEmoji: languages.flagEmoji,
      })
      .from(languages)
      .where(eq(languages.userId, user.id)),
  ])

  // Per-language stats
  const langStats = await Promise.all(
    userLanguages.map(async lang => {
      const [[{ rulesCount }], [{ vocabCount }], [{ sessionsCount }], [{ avgEma }]] =
        await Promise.all([
          db.select({ rulesCount: count() }).from(rules).where(and(eq(rules.languageId, lang.id), eq(rules.userId, user.id))),
          db.select({ vocabCount: count() }).from(vocabulary).where(and(eq(vocabulary.languageId, lang.id), eq(vocabulary.userId, user.id))),
          db.select({ sessionsCount: count() }).from(sessions).where(and(eq(sessions.languageId, lang.id), eq(sessions.userId, user.id))),
          db
            .select({ avgEma: avg(ruleStats.emaScore) })
            .from(ruleStats)
            .innerJoin(rules, eq(ruleStats.ruleId, rules.id))
            .where(and(eq(rules.languageId, lang.id), eq(ruleStats.userId, user.id))),
        ])
      return { ...lang, rulesCount, vocabCount, sessionsCount, avgEma: avgEma ? Number(avgEma) : null }
    })
  )

  const globalAvg = avgScore ? Number(avgScore) : null

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Progress</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your stats and weak spots</p>
      </div>

      {/* Overall stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Sessions', value: totalSessions },
          { label: 'Tasks', value: totalAnswered },
          { label: 'Avg score', value: globalAvg !== null ? globalAvg.toFixed(1) : '—' },
        ].map(stat => (
          <div key={stat.label} className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{stat.label}</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Per-language */}
      {langStats.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">By language</p>
          <div className="flex flex-col gap-2">
            {langStats.map(lang => (
              <div key={lang.id} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-foreground">
                    {lang.flagEmoji && <span className="mr-1.5">{lang.flagEmoji}</span>}
                    {lang.name}
                  </span>
                  {lang.avgEma !== null && <EmaBar score={lang.avgEma} />}
                </div>
                <div className="flex gap-4">
                  {[
                    { label: 'Rules', value: lang.rulesCount },
                    { label: 'Words', value: lang.vocabCount },
                    { label: 'Sessions', value: lang.sessionsCount },
                  ].map(s => (
                    <div key={s.label}>
                      <p className="text-xs text-muted-foreground/60">{s.label}</p>
                      <p className="text-sm font-medium text-foreground">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weak rules */}
      {weakRules.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Weak rules
          </p>
          <div className="flex flex-col gap-1.5">
            {weakRules.map(r => (
              <div
                key={r.ruleId}
                className="bg-card rounded-xl border border-border px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.ruleTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.attemptsTotal} attempts</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <EmaBar score={r.emaScore} />
                  <Link
                    href={`/practice?languageId=${r.languageId}&ruleId=${r.ruleId}`}
                    className="text-xs text-foreground border border-border rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors whitespace-nowrap"
                  >
                    Practice
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent sessions</p>
            <Link href="/history" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              View all →
            </Link>
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {recentSessions.map((s, i) => {
              const lang = userLanguages.find(l => l.id === s.languageId)
              return (
                <Link
                  key={s.id}
                  href={`/history/${s.id}`}
                  className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${
                    i < recentSessions.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {lang?.flagEmoji && <span>{lang.flagEmoji}</span>}
                      <span className="text-sm text-foreground">{lang?.name ?? '—'}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        s.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {s.status === 'completed' ? 'done' : 'active'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      {formatDate(s.createdAt)} · {s.completed}/{s.totalTasks} tasks
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ScoreBadge score={s.avgScore} />
                    <span className="text-muted-foreground text-xs">→</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalSessions === 0 && (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <p className="text-2xl mb-2">📊</p>
          <p className="text-sm font-medium text-foreground">No stats yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Complete your first practice session</p>
          <Link
            href="/practice"
            className="inline-block bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Start practice
          </Link>
        </div>
      )}
    </div>
  )
}