'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { RuleWithStats } from '@/types'

type Language = { id: string; name: string; flagEmoji: string | null }

function EmaBar({ score }: { score: number | null }) {
  const val = score ?? 0.5
  const color = val >= 0.75 ? '#34d399' : val >= 0.5 ? '#fbbf24' : '#f87171'
  return (
    <div className="h-1.5 w-12 bg-[#f0efe9] rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${val * 100}%`, background: color }} />
    </div>
  )
}

const TASK_COUNTS = [5, 10, 15, 20]

export default function PracticePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedLang = searchParams.get('languageId')
  const preselectedRule = searchParams.get('ruleId')

  const [languages, setLanguages] = useState<Language[]>([])
  const [selectedLang, setSelectedLang] = useState<string>(preselectedLang ?? '')
  const [rules, setRules] = useState<RuleWithStats[]>([])
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set())
  const [taskCount, setTaskCount] = useState(10)
  const [includeVocab, setIncludeVocab] = useState(false)

  const [loadingLangs, setLoadingLangs] = useState(true)
  const [loadingRules, setLoadingRules] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  // Load languages
  useEffect(() => {
    fetch('/api/languages')
      .then(r => r.json())
      .then((data: Language[]) => {
        setLanguages(data)
        if (data.length === 1) setSelectedLang(data[0].id)
        setLoadingLangs(false)
      })
  }, [])

  // Load rules when language changes
  useEffect(() => {
    if (!selectedLang) return
    setLoadingRules(true)
    setSelectedRules(new Set())
    fetch(`/api/rules?languageId=${selectedLang}`)
      .then(r => r.json())
      .then((data: RuleWithStats[]) => {
        setRules(data)
        // Auto-select: if preselected rule exists use it, else select all
        if (preselectedRule && data.some(r => r.id === preselectedRule)) {
          setSelectedRules(new Set([preselectedRule]))
        } else {
          setSelectedRules(new Set(data.map(r => r.id)))
        }
        setLoadingRules(false)
      })
  }, [selectedLang])

  function toggleRule(id: string) {
    setSelectedRules(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedRules.size === rules.length) {
      setSelectedRules(new Set())
    } else {
      setSelectedRules(new Set(rules.map(r => r.id)))
    }
  }

  async function handleStart() {
    if (selectedRules.size === 0) {
      setError('Выберите хотя бы одно правило')
      return
    }
    setError('')
    setStarting(true)

    try {
      // Create session
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          languageId: selectedLang,
          ruleIds: Array.from(selectedRules),
          taskCount,
          includeVocab,
        }),
      })
      if (!sessionRes.ok) throw new Error('Failed to create session')
      const session = await sessionRes.json()

      // Generate tasks
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          languageId: selectedLang,
          ruleIds: Array.from(selectedRules),
          includeVocab,
        }),
      })
      if (!genRes.ok) throw new Error('Failed to generate tasks')

      router.push(`/practice/session/${session.id}`)
    } catch {
      setError('Не удалось создать сессию. Проверьте API ключ.')
      setStarting(false)
    }
  }

  if (loadingLangs) return <p className="text-sm text-[#888]">Загружаем...</p>

  if (languages.length === 0) {
    return (
      <div className="max-w-md">
        <h1 className="text-xl font-semibold text-[#1a1a1a] mb-6">Практика</h1>
        <div className="bg-white rounded-xl border border-[#e8e8e8] p-8 text-center">
          <p className="text-2xl mb-2">🌍</p>
          <p className="text-sm font-medium text-[#1a1a1a]">Сначала добавьте язык</p>
          <p className="text-xs text-[#888] mt-1">и хотя бы одно правило</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1a1a1a]">Практика</h1>
        <p className="text-sm text-[#888] mt-0.5">Настройте сессию и начните</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Language */}
        {languages.length > 1 && (
          <div className="bg-white rounded-xl border border-[#e8e8e8] p-4">
            <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">Язык</p>
            <div className="flex flex-wrap gap-2">
              {languages.map(lang => (
                <button
                  key={lang.id}
                  onClick={() => setSelectedLang(lang.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    selectedLang === lang.id
                      ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                      : 'border-[#e8e8e8] text-[#555] hover:bg-[#f7f6f3]'
                  }`}
                >
                  {lang.flagEmoji && <span className="mr-1.5">{lang.flagEmoji}</span>}
                  {lang.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Rules */}
        {selectedLang && (
          <div className="bg-white rounded-xl border border-[#e8e8e8] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-[#888] uppercase tracking-wide">Правила</p>
              {rules.length > 0 && (
                <button
                  onClick={toggleAll}
                  className="text-xs text-[#888] hover:text-[#1a1a1a] transition-colors"
                >
                  {selectedRules.size === rules.length ? 'Снять всё' : 'Выбрать всё'}
                </button>
              )}
            </div>

            {loadingRules ? (
              <p className="text-sm text-[#888]">Загружаем...</p>
            ) : rules.length === 0 ? (
              <p className="text-sm text-[#888]">Нет правил для этого языка</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {rules.map(rule => {
                  const isWeak = (rule.emaScore ?? 0.5) < 0.6
                  return (
                    <label
                      key={rule.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        selectedRules.has(rule.id) ? 'bg-[#f7f6f3]' : 'hover:bg-[#fafafa]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRules.has(rule.id)}
                        onChange={() => toggleRule(rule.id)}
                        className="accent-[#1a1a1a] w-4 h-4"
                      />
                      <span className="flex-1 text-sm text-[#1a1a1a] min-w-0">
                        {rule.title}
                        {isWeak && (
                          <span className="ml-2 text-xs bg-[#FAEEDA] text-[#7a5c1e] px-1.5 py-0.5 rounded">
                            слабое
                          </span>
                        )}
                      </span>
                      <EmaBar score={rule.emaScore} />
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Options */}
        {selectedLang && rules.length > 0 && (
          <div className="bg-white rounded-xl border border-[#e8e8e8] p-4">
            <p className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">Параметры</p>

            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs text-[#888] mb-2">Количество заданий</p>
                <div className="flex gap-2">
                  {TASK_COUNTS.map(n => (
                    <button
                      key={n}
                      onClick={() => setTaskCount(n)}
                      className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                        taskCount === n
                          ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                          : 'border-[#e8e8e8] text-[#555] hover:bg-[#f7f6f3]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeVocab}
                  onChange={e => setIncludeVocab(e.target.checked)}
                  className="accent-[#1a1a1a] w-4 h-4"
                />
                <span className="text-sm text-[#555]">Включить задания по словарю</span>
              </label>
            </div>
          </div>
        )}

        {error && (
          <p className="text-red-500 bg-red-50 px-3 py-2 rounded-lg text-xs">{error}</p>
        )}

        {selectedLang && rules.length > 0 && (
          <button
            onClick={handleStart}
            disabled={starting || selectedRules.size === 0}
            className="bg-[#1a1a1a] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50 transition-opacity"
          >
            {starting ? 'Генерируем задания...' : `Начать практику · ${taskCount} заданий`}
          </button>
        )}
      </div>
    </div>
  )
}