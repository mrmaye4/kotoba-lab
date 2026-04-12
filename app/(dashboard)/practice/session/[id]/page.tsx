'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TASK_TYPE_LABELS, type Task, type Session } from '@/types'

type SessionData = { session: Session; tasks: Task[] }

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
  const inputClass =
    'w-full bg-[#f7f6f3] border border-[#e8e8e8] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1a1a1a] transition-colors disabled:opacity-60'

  if (task.type === 'mcq' && task.options) {
    return (
      <div className="flex flex-col gap-2">
        {task.options.map((opt, i) => {
          const letter = opt.charAt(0)
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => setAnswer(letter)}
              className={`text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                answer === letter
                  ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                  : 'border-[#e8e8e8] text-[#444] hover:bg-[#f7f6f3]'
              } disabled:opacity-60`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    )
  }

  if (task.type === 'open_write') {
    return (
      <textarea
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        disabled={disabled}
        placeholder="Напишите ваш ответ..."
        rows={4}
        className={`${inputClass} resize-none`}
      />
    )
  }

  if (['transform', 'translate', 'error_find'].includes(task.type)) {
    return (
      <textarea
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        disabled={disabled}
        placeholder="Ваш ответ..."
        rows={3}
        className={`${inputClass} resize-none`}
      />
    )
  }

  return (
    <input
      type="text"
      value={answer}
      onChange={e => setAnswer(e.target.value)}
      disabled={disabled}
      placeholder="Ваш ответ..."
      className={inputClass}
    />
  )
}

export default function SessionPage() {
  const { id: sessionId } = useParams<{ id: string }>()
  const router = useRouter()

  const [data, setData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  const [answer, setAnswer] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{ score: number; feedback: string; isCorrect: boolean } | null>(null)

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then(r => r.json())
      .then((d: SessionData) => { setData(d); setLoading(false) })
  }, [sessionId])

  if (loading || !data) return <p className="text-sm text-[#888]">Загружаем...</p>

  const { session, tasks } = data

  // Summary screen
  if (session.status === 'completed' || current >= tasks.length) {
    const answered = tasks.filter(t => t.score !== null)
    const avg = answered.length > 0
      ? answered.reduce((a, t) => a + (t.score ?? 0), 0) / answered.length
      : 0

    const byType = answered.reduce<Record<string, { total: number; sum: number }>>((acc, t) => {
      if (!acc[t.type]) acc[t.type] = { total: 0, sum: 0 }
      acc[t.type].total++
      acc[t.type].sum += t.score ?? 0
      return acc
    }, {})

    return (
      <div className="max-w-md">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Сессия завершена</h1>
        </div>

        {/* Avg score */}
        <div className="bg-white rounded-2xl border border-[#e8e8e8] p-6 text-center mb-4">
          <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-2">Средний балл</p>
          <p className={`text-4xl font-bold ${avg >= 7 ? 'text-[#34d399]' : avg >= 4 ? 'text-[#fbbf24]' : 'text-[#f87171]'}`}>
            {avg.toFixed(1)}
          </p>
          <p className="text-xs text-[#888] mt-1">из 10 · {answered.length} заданий</p>
        </div>

        {/* By type */}
        {Object.entries(byType).length > 0 && (
          <div className="bg-white rounded-xl border border-[#e8e8e8] p-4 mb-4">
            <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">По типам</p>
            <div className="flex flex-col gap-2">
              {Object.entries(byType).map(([type, stat]) => {
                const typeAvg = stat.sum / stat.total
                return (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-[#555]">{TASK_TYPE_LABELS[type as keyof typeof TASK_TYPE_LABELS]}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 bg-[#f0efe9] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(typeAvg / 10) * 100}%`,
                            background: typeAvg >= 7 ? '#34d399' : typeAvg >= 4 ? '#fbbf24' : '#f87171',
                          }}
                        />
                      </div>
                      <span className="text-xs text-[#888] w-8 text-right">{typeAvg.toFixed(1)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Link
            href="/practice"
            className="flex-1 text-center border border-[#e8e8e8] text-[#666] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f7f6f3] transition-colors"
          >
            Ещё практика
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 text-center bg-[#1a1a1a] text-white rounded-xl py-2.5 text-sm font-medium hover:opacity-80 transition-opacity"
          >
            На главную
          </Link>
        </div>
      </div>
    )
  }

  const task = tasks[current]

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

    // Update local task state
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        tasks: prev.tasks.map((t, i) =>
          i === current ? { ...t, userAnswer: answer, score: data.score, feedback: data.feedback, isCorrect: data.isCorrect } : t
        ),
      }
    })
    setChecking(false)
  }

  function handleNext() {
    setResult(null)
    setAnswer('')
    setCurrent(c => c + 1)
  }

  return (
    <div className="max-w-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-[#888] mb-0.5">Практика</div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Сессия</h1>
        </div>
        <span className="text-sm text-[#888]">{current + 1} / {tasks.length}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[#f0efe9] rounded-full mb-5">
        <div
          className="h-full bg-[#1a1a1a] rounded-full transition-all"
          style={{ width: `${(current / tasks.length) * 100}%` }}
        />
      </div>

      {/* Task card */}
      <div className="bg-white rounded-2xl border border-[#e8e8e8] p-6 mb-3">
        <div className="text-xs text-[#888] mb-3 uppercase tracking-wide">
          {TASK_TYPE_LABELS[task.type]}
        </div>
        <p className="text-base text-[#1a1a1a] mb-4 leading-relaxed">{task.prompt}</p>

        <TaskInput
          task={task}
          answer={answer}
          setAnswer={setAnswer}
          disabled={!!result || checking}
        />

        {/* Feedback */}
        {result && (
          <div
            className={`rounded-xl p-4 mt-4 ${
              result.score >= 7
                ? 'bg-[#E1F5EE]'
                : result.score >= 4
                ? 'bg-[#FAEEDA]'
                : 'bg-[#FCEBEB]'
            }`}
          >
            <div className="font-semibold text-sm text-[#1a1a1a]">{result.score}/10</div>
            <p className="text-sm mt-1 text-[#444]">{result.feedback}</p>
          </div>
        )}
      </div>

      {/* Action button */}
      {!result ? (
        <button
          onClick={handleCheck}
          disabled={checking || (!answer.trim())}
          className="w-full bg-[#1a1a1a] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40 transition-opacity"
        >
          {checking ? 'Проверяем...' : 'Проверить'}
        </button>
      ) : (
        <button
          onClick={handleNext}
          className="w-full bg-[#1a1a1a] text-white rounded-xl py-3 text-sm font-medium hover:opacity-80 transition-opacity"
        >
          {current + 1 >= tasks.length ? 'Завершить' : 'Следующее →'}
        </button>
      )}
    </div>
  )
}