'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Word = {
  id: string
  word: string
  translation: string
  context: string | null
  interval: number
}

const BUTTONS = [
  { q: 0, label: 'Снова', variant: 'destructive' as const },
  { q: 2, label: 'Сложно', className: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' },
  { q: 4, label: 'Хорошо', className: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' },
  { q: 5, label: 'Легко', className: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' },
]

export default function ReviewPage() {
  const { id: languageId } = useParams<{ id: string }>()
  const router = useRouter()

  const [cards, setCards] = useState<Word[]>([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [reviewed, setReviewed] = useState(0)

  useEffect(() => {
    fetch(`/api/vocabulary?languageId=${languageId}&due=1`)
      .then(r => r.json())
      .then((data: Word[]) => {
        setCards(data)
        setLoading(false)
        if (data.length === 0) setDone(true)
      })
  }, [languageId])

  async function handleAnswer(q: number) {
    if (submitting) return
    const card = cards[current]
    setSubmitting(true)

    await fetch('/api/vocabulary/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: card.id, q }),
    })

    setSubmitting(false)
    setFlipped(false)
    setReviewed(r => r + 1)

    if (current + 1 >= cards.length) {
      setDone(true)
    } else {
      setCurrent(c => c + 1)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Загружаем...</p>

  if (done) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-4xl mb-4">🎉</p>
        <h1 className="text-xl font-semibold mb-2">Готово!</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {reviewed > 0
            ? `Повторили ${reviewed} ${reviewed === 1 ? 'слово' : 'слов'}`
            : 'Нет слов на повторение сегодня'}
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" nativeButton={false} render={<Link href={`/languages/${languageId}/vocabulary`} />}>
            К словарю
          </Button>
          <Button nativeButton={false} render={<Link href="/practice" />}>
            Практика
          </Button>
        </div>
      </div>
    )
  }

  const card = cards[current]

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Слова / Повторение</p>
          <h1 className="text-xl font-semibold">Карточки</h1>
        </div>
        <span className="text-sm text-muted-foreground">{current + 1} / {cards.length}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full mb-6">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${(current / cards.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      <Card
        className="cursor-pointer text-center min-h-[200px] mb-4 select-none"
        onClick={() => !flipped && setFlipped(true)}
      >
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10">
          <p className="text-2xl font-semibold">{card.word}</p>

          {!flipped ? (
            <p className="text-xs text-muted-foreground mt-2">Нажмите чтобы показать перевод</p>
          ) : (
            <>
              <div className="w-8 h-px bg-border" />
              <p className="text-lg text-muted-foreground">{card.translation}</p>
              {card.context && (
                <p className="text-sm text-muted-foreground italic mt-1">"{card.context}"</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Answer buttons */}
      {flipped ? (
        <div className="grid grid-cols-4 gap-2">
          {BUTTONS.map(btn => (
            <Button
              key={btn.q}
              variant={btn.variant ?? 'outline'}
              className={btn.className}
              onClick={() => handleAnswer(btn.q)}
              disabled={submitting}
            >
              {btn.label}
            </Button>
          ))}
        </div>
      ) : (
        <Button className="w-full" onClick={() => setFlipped(true)}>
          Показать перевод
        </Button>
      )}

      <p className="text-xs text-center text-muted-foreground mt-4">
        Интервал после ответа: Снова=1д · Сложно={card.interval}д · Хорошо/Легко={Math.round(card.interval * 2.5)}д+
      </p>
    </div>
  )
}