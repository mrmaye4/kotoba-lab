'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { DrillItem } from '@/types'

type AnswerState = 'unanswered' | 'correct' | 'wrong'

function DrillSession() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ruleIds = searchParams.get('ruleIds') ?? ''
  const mode = searchParams.get('mode') ?? 'due'

  const [items, setItems] = useState<DrillItem[]>([])
  const [index, setIndex] = useState(0)
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered')
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!ruleIds) return
    fetch(`/api/drills/items?ruleIds=${ruleIds}&mode=${mode}`)
      .then(r => r.json())
      .then((data: DrillItem[]) => {
        setItems(data)
        setLoading(false)
        if (data.length === 0) setDone(true)
      })
  }, [ruleIds, mode])

  const current = items[index]

  async function handleChoice(choice: string) {
    if (answerState !== 'unanswered' || !current) return

    const correct = choice === current.correctAnswer
    setSelectedChoice(choice)
    setAnswerState(correct ? 'correct' : 'wrong')
    if (correct) setScore(s => s + 1)

    await fetch('/api/drills/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: current.id, correct }),
    })
  }

  function handleNext() {
    if (index + 1 >= items.length) {
      setDone(true)
      return
    }
    setIndex(i => i + 1)
    setAnswerState('unanswered')
    setSelectedChoice(null)
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>

  if (done) {
    return (
      <div className="max-w-sm mx-auto text-center pt-16">
        <div className="text-4xl mb-4">🎯</div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Done!</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {score} / {items.length} correct
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => { setIndex(0); setScore(0); setAnswerState('unanswered'); setSelectedChoice(null); setDone(false) }}
            className="w-full py-3 bg-foreground text-background rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Practice again
          </button>
          <button
            onClick={() => router.push('/drills')}
            className="w-full py-3 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Back to Drills
          </button>
        </div>
      </div>
    )
  }

  if (!current) return null

  return (
    <div className="max-w-sm mx-auto pt-8">
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${((index + 1) / items.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{index + 1} / {items.length}</span>
      </div>

      {/* Prompt */}
      <div className="text-center mb-10">
        <p className="text-4xl font-bold text-foreground">{current.prompt}</p>
      </div>

      {/* Choices */}
      <div className="flex flex-col gap-3">
        {current.choices.map(choice => {
          const isSelected = selectedChoice === choice
          const isCorrect = choice === current.correctAnswer
          let className = 'w-full py-4 rounded-xl text-base font-medium border-2 transition-all '

          if (answerState === 'unanswered') {
            className += 'border-border bg-card text-foreground hover:border-foreground hover:bg-muted cursor-pointer'
          } else if (isCorrect) {
            className += 'border-green-500 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
          } else if (isSelected && !isCorrect) {
            className += 'border-red-400 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
          } else {
            className += 'border-border bg-card text-muted-foreground'
          }

          return (
            <button
              key={choice}
              onClick={() => handleChoice(choice)}
              disabled={answerState !== 'unanswered'}
              className={className}
            >
              {choice}
              {answerState !== 'unanswered' && isCorrect && ' ✓'}
              {answerState !== 'unanswered' && isSelected && !isCorrect && ' ✗'}
            </button>
          )
        })}
      </div>

      {/* Next button */}
      {answerState !== 'unanswered' && (
        <button
          onClick={handleNext}
          className="w-full mt-6 py-3 bg-foreground text-background rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {index + 1 >= items.length ? 'Finish' : 'Next →'}
        </button>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
      <DrillSession />
    </Suspense>
  )
}