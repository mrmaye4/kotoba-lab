import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { sessions, languages } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import DeleteSessionButton from './_components/DeleteSessionButton'

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>
  const color =
    score >= 7 ? 'text-emerald-600 dark:text-emerald-400' :
    score >= 4 ? 'text-amber-600 dark:text-amber-400' :
    'text-destructive'
  return <span className={`text-sm font-semibold ${color}`}>{score.toFixed(1)}</span>
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('en-US', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [allSessions, userLanguages] = await Promise.all([
    db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id))
      .orderBy(desc(sessions.createdAt)),

    db
      .select({ id: languages.id, name: languages.name, flagEmoji: languages.flagEmoji })
      .from(languages)
      .where(eq(languages.userId, user.id)),
  ])

  const langMap = Object.fromEntries(userLanguages.map(l => [l.id, l]))

  // Group sessions by date
  const groups: Record<string, typeof allSessions> = {}
  for (const s of allSessions) {
    const key = new Date(s.createdAt).toLocaleDateString('en-US', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">History</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{allSessions.length} sessions total</p>
      </div>

      {allSessions.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm font-medium">No sessions yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Complete a practice session to see your history</p>
          <Link
            href="/practice"
            className="inline-block bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Start practice
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(groups).map(([date, daySessions]) => (
            <div key={date}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{date}</p>
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                {daySessions.map((s, i) => {
                  const lang = langMap[s.languageId]
                  const isLast = i === daySessions.length - 1
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center gap-2 px-4 py-3 ${!isLast ? 'border-b border-border' : ''}`}
                    >
                      <Link
                        href={`/history/${s.id}`}
                        className="flex flex-1 items-center justify-between gap-3 min-w-0 hover:bg-muted/50 rounded-lg -mx-1 px-1 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {lang?.flagEmoji && <span>{lang.flagEmoji}</span>}
                            <span className="text-sm font-medium text-foreground">{lang?.name ?? '—'}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              s.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {s.status === 'completed' ? 'done' : 'active'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatTime(s.createdAt)} · {s.completed}/{s.totalTasks} tasks
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <ScoreBadge score={s.avgScore} />
                          <span className="text-muted-foreground text-xs">→</span>
                        </div>
                      </Link>
                      <DeleteSessionButton sessionId={s.id} />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}