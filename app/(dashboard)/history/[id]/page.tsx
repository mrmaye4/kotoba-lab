import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { sessions, tasks, rules, languages } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import type { TaskType } from '@/types'
import DeleteSessionButton from '../_components/DeleteSessionButton'

const TYPE_LABELS: Record<TaskType, string> = {
  mcq: 'MCQ',
  fill_blank: 'Fill blank',
  transform: 'Transform',
  open_write: 'Free write',
  vocabulary: 'Vocabulary',
  error_find: 'Error find',
  translate: 'Translate',
}

function ScoreBadge({ score, isCorrect }: { score: number | null; isCorrect: boolean | null }) {
  if (score === null) return null
  const color =
    score >= 7 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' :
    score >= 4 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' :
    'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${color}`}>
      {score}/10
    </span>
  )
}

function TypeBadge({ type }: { type: TaskType }) {
  return (
    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
      {TYPE_LABELS[type] ?? type}
    </span>
  )
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, user.id)))
    .limit(1)

  if (!session) notFound()

  const [sessionTasks, lang] = await Promise.all([
    db
      .select({
        id: tasks.id,
        type: tasks.type,
        prompt: tasks.prompt,
        options: tasks.options,
        correctAnswer: tasks.correctAnswer,
        userAnswer: tasks.userAnswer,
        score: tasks.score,
        feedback: tasks.feedback,
        isCorrect: tasks.isCorrect,
        ruleId: tasks.ruleId,
        ruleTitle: rules.title,
      })
      .from(tasks)
      .leftJoin(rules, eq(tasks.ruleId, rules.id))
      .where(eq(tasks.sessionId, id)),

    db
      .select({ name: languages.name, flagEmoji: languages.flagEmoji })
      .from(languages)
      .where(eq(languages.id, session.languageId))
      .limit(1),
  ])

  const answered = sessionTasks.filter(t => t.score !== null)
  const correct = answered.filter(t => t.isCorrect)
  // Prefer the stored session avg (accurate) over recalculating from task scores
  const avgScore = session.avgScore !== null
    ? session.avgScore
    : answered.length > 0
      ? answered.reduce((s, t) => s + (t.score ?? 0), 0) / answered.length
      : null

  const dateStr = new Date(session.createdAt).toLocaleDateString('en-US', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="max-w-2xl">
      {/* Back */}
      <Link href="/history" className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-4 inline-block">
        ← History
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{dateStr}</p>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            {lang[0]?.flagEmoji && <span>{lang[0].flagEmoji}</span>}
            {lang[0]?.name ?? 'Session'}
          </h1>
        </div>
        <div className="flex items-start gap-3">
        <div className="text-right">
          {avgScore !== null && (
            <p className={`text-2xl font-semibold ${
              avgScore >= 7 ? 'text-emerald-600 dark:text-emerald-400' :
              avgScore >= 4 ? 'text-amber-600 dark:text-amber-400' :
              'text-destructive'
            }`}>{avgScore.toFixed(1)}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            {correct.length}/{answered.length} correct
          </p>
        </div>
        <DeleteSessionButton sessionId={session.id} redirectAfter="/history" />
        </div>
      </div>

      {/* Summary bar */}
      {answered.length > 0 && (
        <div className="h-2 bg-muted rounded-full mb-6 overflow-hidden flex gap-0.5">
          {sessionTasks.map(t => (
            <div
              key={t.id}
              className={`flex-1 rounded-full ${
                t.score === null ? 'bg-muted-foreground/20' :
                t.isCorrect ? 'bg-emerald-400 dark:bg-emerald-500' :
                (t.score ?? 0) >= 4 ? 'bg-amber-400 dark:bg-amber-500' :
                'bg-red-400 dark:bg-red-500'
              }`}
            />
          ))}
        </div>
      )}

      {/* Tasks */}
      <div className="flex flex-col gap-3">
        {sessionTasks.map((task, i) => {
          const unanswered = task.score === null
          return (
            <div
              key={task.id}
              className={`bg-card rounded-xl border overflow-hidden ${
                unanswered ? 'border-border opacity-50' :
                task.isCorrect ? 'border-emerald-200 dark:border-emerald-800' :
                (task.score ?? 0) >= 4 ? 'border-amber-200 dark:border-amber-800' :
                'border-red-200 dark:border-red-800'
              }`}
            >
              {/* Task header */}
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-muted/30">
                <span className="text-xs text-muted-foreground font-medium">#{i + 1}</span>
                <TypeBadge type={task.type as TaskType} />
                {task.ruleTitle && (
                  <span className="text-xs text-muted-foreground truncate flex-1">{task.ruleTitle}</span>
                )}
                {!unanswered && <ScoreBadge score={task.score} isCorrect={task.isCorrect} />}
                {unanswered && <span className="text-xs text-muted-foreground ml-auto">skipped</span>}
              </div>

              <div className="px-4 py-3 flex flex-col gap-2.5">
                {/* Prompt */}
                <p className="text-sm text-foreground">{task.prompt}</p>

                {/* MCQ options */}
                {task.type === 'mcq' && task.options && (
                  <div className="flex flex-col gap-1">
                    {(task.options as string[]).map(opt => {
                      const letter = opt[0]
                      const isCorrectOpt = task.correctAnswer === letter
                      const isUserOpt = task.userAnswer === letter
                      return (
                        <div
                          key={opt}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border ${
                            isCorrectOpt
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : isUserOpt
                              ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300'
                              : 'border-border text-muted-foreground'
                          }`}
                        >
                          {opt}
                          {isCorrectOpt && <span className="ml-1.5 opacity-60">✓</span>}
                          {isUserOpt && !isCorrectOpt && <span className="ml-1.5 opacity-60">✗ your answer</span>}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* User answer for non-MCQ */}
                {task.type !== 'mcq' && task.userAnswer && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground">Your answer:</p>
                    <p className={`text-sm px-3 py-2 rounded-lg border ${
                      task.isCorrect
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                        : (task.score ?? 0) >= 4
                        ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                        : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                    }`}>
                      {task.userAnswer}
                    </p>
                  </div>
                )}

                {/* Correct answer (if wrong and applicable) */}
                {!task.isCorrect && task.correctAnswer && task.type !== 'mcq' && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground">Correct answer:</p>
                    <p className="text-sm px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                      {task.correctAnswer}
                    </p>
                  </div>
                )}

                {/* Feedback */}
                {task.feedback && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-0.5">
                    {task.feedback}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {sessionTasks.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">No tasks in this session</p>
      )}
    </div>
  )
}