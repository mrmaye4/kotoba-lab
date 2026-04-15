'use client'

import { useParams, useSearchParams } from 'next/navigation'
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

type CardEntry = Word & { direction: 'word_to_translation' | 'translation_to_word' }

const BUTTONS = [
  { q: 0, label: 'Again', variant: 'destructive' as const },
  { q: 2, label: 'Hard', className: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400 dark:hover:bg-amber-950' },
  { q: 4, label: 'Good', className: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-950' },
  { q: 5, label: 'Easy', className: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-950' },
]

const LANG_CODE_MAP: Record<string, string> = {
  japanese: 'ja-JP',
  korean: 'ko-KR',
  chinese: 'zh-CN',
  mandarin: 'zh-CN',
  cantonese: 'zh-HK',
  spanish: 'es-ES',
  french: 'fr-FR',
  german: 'de-DE',
  italian: 'it-IT',
  portuguese: 'pt-PT',
  russian: 'ru-RU',
  arabic: 'ar-SA',
  hindi: 'hi-IN',
  thai: 'th-TH',
  vietnamese: 'vi-VN',
  dutch: 'nl-NL',
  polish: 'pl-PL',
  turkish: 'tr-TR',
  swedish: 'sv-SE',
  norwegian: 'nb-NO',
  danish: 'da-DK',
  finnish: 'fi-FI',
  greek: 'el-GR',
  hebrew: 'he-IL',
  czech: 'cs-CZ',
  romanian: 'ro-RO',
  hungarian: 'hu-HU',
  ukrainian: 'uk-UA',
  indonesian: 'id-ID',
  malay: 'ms-MY',
}

function getLangCode(name: string): string {
  return LANG_CODE_MAP[name.toLowerCase()] ?? 'en-US'
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const SpeakerIcon = ({ size = 18 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
  </svg>
)

const PauseIcon = ({ size = 18 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16"/>
    <rect x="14" y="4" width="4" height="16"/>
  </svg>
)

export default function ReviewPage() {
  const { id: languageId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const categoryId = searchParams.get('categoryId')

  const [cards, setCards] = useState<CardEntry[]>([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [langCode, setLangCode] = useState('en-US')
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    fetch('/api/languages')
      .then(r => r.json())
      .then((langs: { id: string; name: string }[]) => {
        const lang = langs.find(l => l.id === languageId)
        if (lang) setLangCode(getLangCode(lang.name))
      })
      .catch(() => {})
  }, [languageId])

  useEffect(() => {
    let url = `/api/vocabulary?languageId=${languageId}&due=1`
    if (categoryId) url += `&categoryId=${encodeURIComponent(categoryId)}`

    fetch(url)
      .then(r => r.json())
      .then((data: Word[]) => {
        const shuffled = shuffle(data).map(w => ({
          ...w,
          direction: (Math.random() < 0.5 ? 'word_to_translation' : 'translation_to_word') as CardEntry['direction'],
        }))
        setCards(shuffled)
        setLoading(false)
        if (shuffled.length === 0) setDone(true)
      })
  }, [languageId, categoryId])

  function speak(text: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    setSpeaking(true)
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = langCode
    utt.onend = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utt)
  }

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

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>

  if (done) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-4xl mb-4">🎉</p>
        <h1 className="text-xl font-semibold mb-2">Done!</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {reviewed > 0
            ? `Reviewed ${reviewed} ${reviewed === 1 ? 'word' : 'words'}`
            : 'No words due for review today'}
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" nativeButton={false} render={<Link href={`/languages/${languageId}/vocabulary`} />}>
            Back to vocabulary
          </Button>
          <Button nativeButton={false} render={<Link href="/practice" />}>
            Practice
          </Button>
        </div>
      </div>
    )
  }

  const card = cards[current]
  const isWordFront = card.direction === 'word_to_translation'
  const frontText = isWordFront ? card.word : card.translation
  const backText = isWordFront ? card.translation : card.word

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Words / Review</p>
          <h1 className="text-xl font-semibold">Flashcards</h1>
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

          {/* Front side */}
          <div className="flex items-center gap-2">
            <p className="text-2xl font-semibold">{frontText}</p>
            {/* TTS button: only for the native-language word, which is on front when word_to_translation, or on back otherwise */}
            {isWordFront && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); speak(card.word) }}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Pronounce"
              >
                {speaking ? <PauseIcon size={18} /> : <SpeakerIcon size={18} />}
              </button>
            )}
          </div>

          {!flipped ? (
            <p className="text-xs text-muted-foreground mt-2">
              {isWordFront ? 'Click to show translation' : 'Click to show word'}
            </p>
          ) : (
            <>
              <div className="w-8 h-px bg-border" />
              <div className="flex items-center gap-2">
                <p className="text-lg text-muted-foreground">{backText}</p>
                {/* TTS on back side when translation_to_word (word is revealed on back) */}
                {!isWordFront && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); speak(card.word) }}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Pronounce"
                  >
                    {speaking ? <PauseIcon size={16} /> : <SpeakerIcon size={16} />}
                  </button>
                )}
              </div>
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
          Show {isWordFront ? 'translation' : 'word'}
        </Button>
      )}

      <p className="text-xs text-center text-muted-foreground mt-4">
        Next review: Again=1d · Hard={card.interval}d · Good/Easy={Math.round(card.interval * 2.5)}d+
      </p>
    </div>
  )
}