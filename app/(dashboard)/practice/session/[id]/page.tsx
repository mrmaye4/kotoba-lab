'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { TASK_TYPE_LABELS, type Task, type Session, type SessionMode } from '@/types'

type SessionData = { session: Session; tasks: Task[] }
type EvalResult = { taskId: string; score: number; feedback: string; isCorrect: boolean }

// ─── Task input component ─────────────────────────────────────────────────────

function TaskInput({
  task,
  answer,
  setAnswer,
  disabled,
}: {
  task: Task
  answer: string
  setAnswer: (v: string) => void
  disabled: boolean
}) {
  const base =
    'w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-ring transition-colors disabled:opacity-60 placeholder:text-muted-foreground'

  if (task.type === 'mcq' && task.options) {
    return (
      <div className="flex flex-col gap-2">
        {task.options.map(opt => {
          const letter = opt.charAt(0)
          return (
            <button
              key={opt}
              disabled={disabled}
              onClick={() => setAnswer(letter)}
              className={`text-left px-4 py-2.5 rounded-xl border text-sm transition-colors disabled:opacity-60 ${
                answer === letter
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border text-foreground hover:bg-muted'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    )
  }

  if (['open_write', 'transform', 'translate', 'error_find'].includes(task.type)) {
    return (
      <textarea
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        disabled={disabled}
        placeholder="Your answer..."
        rows={task.type === 'open_write' ? 4 : 3}
        className={`${base} resize-none`}
      />
    )
  }

  return (
    <input
      type="text"
      value={answer}
      onChange={e => setAnswer(e.target.value)}
      disabled={disabled}
      placeholder="Your answer..."
      className={base}
    />
  )
}

// ─── Results screen (item 5) ──────────────────────────────────────────────────

function ResultsScreen({
  tasks,
  session,
  onPracticeMore,
}: {
  tasks: Task[]
  session: Session
  onPracticeMore: () => void
}) {
  const answered = tasks.filter(t => t.score !== null)
  const avg = answered.length > 0
    ? answered.reduce((a, t) => a + (t.score ?? 0), 0) / answered.length
    : 0
  const correct = answered.filter(t => t.isCorrect).length
  const scoreColor = avg >= 7 ? 'text-emerald-400' : avg >= 4 ? 'text-amber-400' : 'text-red-400'

  // Per-type breakdown
  const byType = answered.reduce<Record<string, { total: number; sum: number }>>((acc, t) => {
    if (!acc[t.type]) acc[t.type] = { total: 0, sum: 0 }
    acc[t.type].total++
    acc[t.type].sum += t.score ?? 0
    return acc
  }, {})

  // Wrong tasks (score < 7)
  const wrongTasks = answered.filter(t => (t.score ?? 0) < 7)

  return (
    <div className="max-w-lg">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">Session complete</h1>
        {session.theme && (
          <p className="text-sm text-muted-foreground mt-0.5">Theme: {session.theme}</p>
        )}
      </div>

      {/* Score card */}
      <div className="bg-card rounded-2xl border border-border p-6 text-center mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Score</p>
        <p className={`text-4xl font-bold ${scoreColor}`}>{avg.toFixed(1)}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {correct}/{answered.length} correct · {tasks.length - answered.length} skipped
        </p>
      </div>

      {/* Progress bar */}
      {answered.length > 0 && (
        <div className="h-2 bg-muted rounded-full mb-4 overflow-hidden flex gap-0.5">
          {tasks.map(t => (
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

      {/* By type */}
      {Object.entries(byType).length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4 mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">By type</p>
          <div className="flex flex-col gap-2">
            {Object.entries(byType).map(([type, stat]) => {
              const typeAvg = stat.sum / stat.total
              const barColor = typeAvg >= 7 ? '#34d399' : typeAvg >= 4 ? '#fbbf24' : '#f87171'
              return (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {TASK_TYPE_LABELS[type as keyof typeof TASK_TYPE_LABELS]}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(typeAvg / 10) * 100}%`, background: barColor }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{typeAvg.toFixed(1)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Wrong tasks breakdown */}
      {wrongTasks.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Needs work</p>
          <div className="flex flex-col gap-2">
            {wrongTasks.map((t, i) => {
              const scoreColor =
                (t.score ?? 0) >= 4 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
              return (
                <div key={t.id} className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs text-muted-foreground">
                      #{i + 1} · {TASK_TYPE_LABELS[t.type]}
                    </span>
                    <span className={`text-sm font-semibold shrink-0 ${scoreColor}`}>
                      {t.score}/10
                    </span>
                  </div>
                  <p className="text-sm text-foreground mb-2">{t.prompt}</p>
                  {t.userAnswer && (
                    <div className="text-xs px-2.5 py-1.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-foreground mb-1.5">
                      Your answer: {t.userAnswer}
                    </div>
                  )}
                  {t.correctAnswer && t.type !== 'mcq' && (
                    <div className="text-xs px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-foreground mb-1.5">
                      Correct: {t.correctAnswer}
                    </div>
                  )}
                  {t.feedback && (
                    <p className="text-xs text-muted-foreground">{t.feedback}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onPracticeMore}
          className="flex-1 text-center border border-border text-muted-foreground rounded-xl py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          More practice
        </button>
        <Link
          href="/dashboard"
          className="flex-1 text-center bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Dashboard
        </Link>
      </div>
    </div>
  )
}

// ─── Practice mode (one task at a time) ───────────────────────────────────────

function PracticeMode({
  tasks,
  session,
  onFinish,
}: {
  tasks: Task[]
  session: Session
  onFinish: (updatedTasks: Task[]) => void
}) {
  const [current, setCurrent] = useState(0)
  const [answer, setAnswer] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{ score: number; feedback: string; isCorrect: boolean } | null>(null)
  const [localTasks, setLocalTasks] = useState(tasks)
  const [finishing, setFinishing] = useState(false)

  const task = localTasks[current]

  async function handleCheck() {
    if (!answer.trim() && task.type !== 'mcq') return
    if (task.type === 'mcq' && !answer) return
    setChecking(true)

    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, userAnswer: answer }),
    })
    const data = await res.json()
    setResult(data)

    setLocalTasks(prev =>
      prev.map((t, i) =>
        i === current
          ? { ...t, userAnswer: answer, score: data.score, feedback: data.feedback, isCorrect: data.isCorrect }
          : t
      )
    )
    setChecking(false)
  }

  function handleNext() {
    setResult(null)
    setAnswer('')
    if (current + 1 >= localTasks.length) {
      onFinish(localTasks)
    } else {
      setCurrent(c => c + 1)
    }
  }

  // Finish now: evaluate current answer if filled, skip rest (item 7)
  async function handleFinishNow() {
    setFinishing(true)
    let finalTasks = localTasks

    // If current task has an answer but not yet checked, check it
    if (answer.trim() && !result) {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, userAnswer: answer }),
      })
      const data = await res.json()
      finalTasks = localTasks.map((t, i) =>
        i === current
          ? { ...t, userAnswer: answer, score: data.score, feedback: data.feedback, isCorrect: data.isCorrect }
          : t
      )
    }

    // Mark remaining tasks as completed (skip)
    const res = await fetch(`/api/sessions/${session.id}/complete`, { method: 'POST' })
    if (!res.ok) {
      // Fallback: just finish with current state
    }

    setFinishing(false)
    onFinish(finalTasks)
  }

  if (current >= localTasks.length) {
    onFinish(localTasks)
    return null
  }

  return (
    <div className="max-w-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          {session.theme && (
            <p className="text-xs text-muted-foreground mb-0.5">{session.theme}</p>
          )}
          <h1 className="text-xl font-semibold text-foreground">Practice</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{current + 1} / {localTasks.length}</span>
          {current > 0 && !result && (
            <button
              onClick={handleFinishNow}
              disabled={finishing}
              className="text-xs text-muted-foreground border border-border rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors disabled:opacity-40"
            >
              {finishing ? '...' : 'Finish now'}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${(current / localTasks.length) * 100}%` }}
        />
      </div>

      {/* Task card */}
      <div className="bg-card rounded-2xl border border-border p-6 mb-3">
        <div className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">
          {TASK_TYPE_LABELS[task.type]}
        </div>
        <p className="text-base text-foreground mb-4 leading-relaxed">{task.prompt}</p>

        <TaskInput
          task={task}
          answer={answer}
          setAnswer={setAnswer}
          disabled={!!result || checking}
        />

        {result && (
          <div className={`rounded-xl p-4 mt-4 ${
            result.score >= 7 ? 'bg-emerald-100 dark:bg-emerald-950/40' :
            result.score >= 4 ? 'bg-amber-100 dark:bg-amber-950/40' :
            'bg-red-100 dark:bg-red-950/40'
          }`}>
            <div className="font-semibold text-sm text-foreground">{result.score}/10</div>
            <p className="text-sm mt-1 text-foreground/80">{result.feedback}</p>
          </div>
        )}
      </div>

      {!result ? (
        <button
          onClick={handleCheck}
          disabled={checking || (!answer.trim() && task.type !== 'mcq') || (task.type === 'mcq' && !answer)}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {checking ? 'Checking...' : 'Check'}
        </button>
      ) : (
        <button
          onClick={handleNext}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {current + 1 >= localTasks.length ? 'Finish' : 'Next →'}
        </button>
      )}
    </div>
  )
}

// ─── Test mode (all tasks at once, batch evaluate) ────────────────────────────

function TestMode({
  tasks,
  session,
  onFinish,
}: {
  tasks: Task[]
  session: Session
  onFinish: (updatedTasks: Task[]) => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState('')

  const answeredCount = Object.values(answers).filter(a => a.trim() !== '').length

  function setAnswer(taskId: string, value: string) {
    setAnswers(prev => ({ ...prev, [taskId]: value }))
  }

  // Finish now: evaluate only answered tasks (item 7)
  async function handleEvaluate(finishNow = false) {
    const items = tasks
      .map(t => ({ taskId: t.id, userAnswer: answers[t.id] ?? '' }))
      .filter(i => finishNow ? i.userAnswer.trim() !== '' : true)

    if (!items.some(i => i.userAnswer.trim() !== '')) {
      setError('Answer at least one task')
      return
    }

    setError('')
    setEvaluating(true)

    const res = await fetch('/api/batch-evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, items }),
    })

    if (!res.ok) {
      setError('Evaluation failed. Please try again.')
      setEvaluating(false)
      return
    }

    const { results }: { results: EvalResult[]; avgScore: number | null } = await res.json()
    const resultsMap = Object.fromEntries(results.map(r => [r.taskId, r]))

    const updatedTasks = tasks.map(t => {
      const r = resultsMap[t.id]
      if (!r) return { ...t, userAnswer: answers[t.id] ?? null }
      return { ...t, userAnswer: answers[t.id] ?? null, score: r.score, feedback: r.feedback, isCorrect: r.isCorrect }
    })

    setEvaluating(false)
    onFinish(updatedTasks)
  }

  return (
    <div className="max-w-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          {session.theme && (
            <p className="text-xs text-muted-foreground mb-0.5">{session.theme}</p>
          )}
          <h1 className="text-xl font-semibold text-foreground">Test</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{answeredCount}/{tasks.length} answered</span>
          {answeredCount > 0 && answeredCount < tasks.length && (
            <button
              onClick={() => handleEvaluate(true)}
              disabled={evaluating}
              className="text-xs text-muted-foreground border border-border rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors disabled:opacity-40"
            >
              {evaluating ? '...' : 'Finish now'}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${(answeredCount / tasks.length) * 100}%` }}
        />
      </div>

      {/* All tasks */}
      <div className="flex flex-col gap-4 mb-4">
        {tasks.map((task, i) => (
          <div key={task.id} className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground font-medium">#{i + 1}</span>
              <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                {TASK_TYPE_LABELS[task.type]}
              </span>
            </div>
            <p className="text-sm text-foreground mb-3 leading-relaxed">{task.prompt}</p>
            <TaskInput
              task={task}
              answer={answers[task.id] ?? ''}
              setAnswer={v => setAnswer(task.id, v)}
              disabled={evaluating}
            />
          </div>
        ))}
      </div>

      {error && (
        <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-xs mb-3">{error}</p>
      )}

      <button
        onClick={() => handleEvaluate(false)}
        disabled={evaluating || answeredCount === 0}
        className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {evaluating ? 'Evaluating...' : `Evaluate${answeredCount < tasks.length ? ` (${answeredCount}/${tasks.length})` : ''}`}
      </button>
    </div>
  )
}

// ─── Story mode (one story at a time, full-text translation) ─────────────────

function StoryMode({
  tasks,
  session,
  onFinish,
}: {
  tasks: Task[]
  session: Session
  onFinish: (updatedTasks: Task[]) => void
}) {
  const [current, setCurrent] = useState(0)
  const [answer, setAnswer] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{ score: number; feedback: string; isCorrect: boolean } | null>(null)
  const [localTasks, setLocalTasks] = useState(tasks)
  const [showHints, setShowHints] = useState(false)

  const task = localTasks[current]

  let hints: string[] = []
  try {
    const ctx = JSON.parse(task?.aiCheckContext ?? '{}')
    hints = ctx.hints ?? []
  } catch { /* ignore */ }

  const direction = (() => {
    try {
      const ctx = JSON.parse(task?.aiCheckContext ?? '{}')
      return ctx.direction === 'to_en' ? 'English' : (ctx.language ?? 'the target language')
    } catch { return 'the other language' }
  })()

  async function handleCheck() {
    if (!answer.trim()) return
    setChecking(true)
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, userAnswer: answer }),
    })
    const data = await res.json()
    setResult(data)
    setLocalTasks(prev =>
      prev.map((t, i) =>
        i === current
          ? { ...t, userAnswer: answer, score: data.score, feedback: data.feedback, isCorrect: data.isCorrect }
          : t
      )
    )
    setChecking(false)
  }

  function handleNext() {
    setResult(null)
    setAnswer('')
    setShowHints(false)
    if (current + 1 >= localTasks.length) {
      fetch(`/api/sessions/${session.id}/complete`, { method: 'POST' })
      onFinish(localTasks)
    } else {
      setCurrent(c => c + 1)
    }
  }

  if (current >= localTasks.length) {
    onFinish(localTasks)
    return null
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-foreground">Story</h1>
        <span className="text-sm text-muted-foreground">{current + 1} / {localTasks.length}</span>
      </div>

      <div className="h-1.5 bg-muted rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${(current / localTasks.length) * 100}%` }}
        />
      </div>

      {/* Story text */}
      <div className="bg-card rounded-2xl border border-border p-6 mb-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Translate into {direction}</p>
        <div className="text-base text-foreground leading-relaxed whitespace-pre-wrap">{task.prompt}</div>
      </div>

      {/* Hints */}
      {hints.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setShowHints(h => !h)}
            className="text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
          >
            {showHints ? 'Hide hints' : 'Show hints'}
          </button>
          {showHints && (
            <ul className="mt-2 bg-muted/50 rounded-xl p-4 flex flex-col gap-1.5">
              {hints.map((h, i) => (
                <li key={i} className="text-sm text-foreground/80">• {h}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Translation textarea */}
      <div className="bg-card rounded-2xl border border-border p-4 mb-3">
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          disabled={!!result || checking}
          placeholder="Your translation..."
          rows={8}
          className="w-full bg-transparent text-sm text-foreground outline-none resize-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        {result && (
          <div className={`rounded-xl p-4 mt-3 ${
            result.score >= 7 ? 'bg-emerald-100 dark:bg-emerald-950/40' :
            result.score >= 4 ? 'bg-amber-100 dark:bg-amber-950/40' :
            'bg-red-100 dark:bg-red-950/40'
          }`}>
            <div className="font-semibold text-sm text-foreground">{result.score}/10</div>
            <p className="text-sm mt-1 text-foreground/80">{result.feedback}</p>
          </div>
        )}
      </div>

      {!result ? (
        <button
          onClick={handleCheck}
          disabled={checking || !answer.trim()}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {checking ? 'Checking...' : 'Submit translation'}
        </button>
      ) : (
        <button
          onClick={handleNext}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {current + 1 >= localTasks.length ? 'Finish' : 'Next story →'}
        </button>
      )}
    </div>
  )
}

// ─── Main session page ────────────────────────────────────────────────────────

export default function SessionPage() {
  const { id: sessionId } = useParams<{ id: string }>()
  const router = useRouter()

  const [data, setData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<'active' | 'results'>('active')
  const [finalTasks, setFinalTasks] = useState<Task[]>([])

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then(r => r.json())
      .then((d: SessionData) => {
        setData(d)
        setLoading(false)
        // If session already completed, go straight to results
        if (d.session.status === 'completed') {
          setFinalTasks(d.tasks)
          setPhase('results')
        }
      })
  }, [sessionId])

  if (loading || !data) {
    return <p className="text-sm text-muted-foreground">Loading...</p>
  }

  const { session, tasks } = data
  const mode: SessionMode = (session.mode as SessionMode) ?? 'practice'

  function handleFinish(updatedTasks: Task[]) {
    setFinalTasks(updatedTasks)
    setPhase('results')
  }

  if (phase === 'results') {
    return (
      <ResultsScreen
        tasks={finalTasks.length > 0 ? finalTasks : tasks}
        session={session}
        onPracticeMore={() => router.push('/practice')}
      />
    )
  }

  if (mode === 'story') {
    return <StoryMode tasks={tasks} session={session} onFinish={handleFinish} />
  }

  // Practice and chaos mode use the same one-task-at-a-time UI
  if (mode === 'practice' || mode === 'chaos') {
    return <PracticeMode tasks={tasks} session={session} onFinish={handleFinish} />
  }

  // Test mode
  return <TestMode tasks={tasks} session={session} onFinish={handleFinish} />
}