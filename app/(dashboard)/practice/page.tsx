'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { RuleWithStats, SessionMode, DifficultyLevel, TaskType } from '@/types'
import { TASK_TYPE_LABELS } from '@/types'

type Language = { id: string; name: string; flagEmoji: string | null }
type Category = { id: string; name: string }

const MODES: { value: SessionMode; label: string; description: string }[] = [
  { value: 'practice', label: 'Practice', description: 'Immediate feedback after each task' },
  { value: 'test', label: 'Test', description: 'Answer all tasks, then evaluate' },
  { value: 'chaos', label: 'Chaos', description: 'Mixed rules with a shared theme' },
  { value: 'story', label: 'Story', description: 'Translate two stories built around your rules' },
]

function EmaBar({ score }: { score: number | null }) {
  const val = score ?? 0.5
  const color = val >= 0.75 ? '#34d399' : val >= 0.5 ? '#fbbf24' : '#f87171'
  return (
    <div className="h-1.5 w-12 bg-muted rounded-full overflow-hidden">
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
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set())
  const [taskCount, setTaskCount] = useState(10)
  const [includeVocab, setIncludeVocab] = useState(false)
  const [mode, setMode] = useState<SessionMode>('practice')
  const [paragraphCount, setParagraphCount] = useState(2)
  const [useTheme, setUseTheme] = useState(false)
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('any')
  const ALL_TYPES = Object.keys(TASK_TYPE_LABELS) as TaskType[]
  const [allowedTypes, setAllowedTypes] = useState<Set<TaskType>>(new Set(ALL_TYPES))

  const [loadingLangs, setLoadingLangs] = useState(true)
  const [loadingRules, setLoadingRules] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const isDue = searchParams.get('due') === '1'
  const isDaily = searchParams.get('daily') === '1'
  const dailyLangId = searchParams.get('lang') ?? ''

  // Load languages
  useEffect(() => {
    fetch('/api/languages')
      .then(r => r.json())
      .then((data: Language[]) => {
        setLanguages(data)
        if (dailyLangId && data.some(l => l.id === dailyLangId)) {
          setSelectedLang(dailyLangId)
        } else if (data.length === 1) {
          setSelectedLang(data[0].id)
        }
        setLoadingLangs(false)
      })
  }, [])

  // Load rules + categories when language changes
  useEffect(() => {
    if (!selectedLang) return
    setLoadingRules(true)
    setSelectedRules(new Set())
    setSelectedCategory(null)
    setCategories([])
    Promise.all([
      fetch(`/api/rules?languageId=${selectedLang}`).then(r => r.json()),
      fetch(`/api/rules/categories?languageId=${selectedLang}`).then(r => r.json()),
    ]).then(([rulesData, catsData]: [RuleWithStats[], Category[]]) => {
      setRules(rulesData)
      setCategories(catsData)
      const now = new Date()
      const dueRules = rulesData.filter(r => r.nextReview && new Date(r.nextReview) <= now)

      if (isDaily) {
        const weakRules = rulesData.filter(r => (r.emaScore ?? 1) < 0.6)
        const toSelect = weakRules.length > 0
          ? weakRules
          : [...rulesData].sort((a, b) => (a.emaScore ?? 1) - (b.emaScore ?? 1)).slice(0, 10)
        setSelectedRules(new Set(toSelect.map(r => r.id)))
      } else if (preselectedRule && rulesData.some(r => r.id === preselectedRule)) {
        setSelectedRules(new Set([preselectedRule]))
      } else if (isDue && dueRules.length > 0) {
        setSelectedRules(new Set(dueRules.map(r => r.id)))
      } else {
        setSelectedRules(new Set(rulesData.map(r => r.id)))
      }
      setLoadingRules(false)
    })
  }, [selectedLang])

  const hasAutoStarted = useRef(false)
  useEffect(() => {
    if (!isDaily || loadingRules || selectedRules.size === 0 || hasAutoStarted.current) return
    hasAutoStarted.current = true
    handleStart('daily')
  }, [isDaily, loadingRules, selectedRules])

  function toggleRule(id: string) {
    setSelectedRules(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const visibleRules = selectedCategory === null
    ? rules
    : rules.filter(r => r.categoryId === selectedCategory)

  function toggleAll() {
    const visibleIds = visibleRules.map(r => r.id)
    const allVisible = visibleIds.every(id => selectedRules.has(id))
    setSelectedRules(prev => {
      const next = new Set(prev)
      if (allVisible) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  async function handleStart(modeOverride?: string) {
    if (selectedRules.size === 0) {
      setError('Select at least one rule')
      return
    }
    setError('')
    setStarting(true)

    try {
      // Create session
      const effectiveMode = modeOverride ?? mode
      const effectiveTaskCount =
        modeOverride === 'daily' ? Math.max(5, selectedRules.size) :
        effectiveMode === 'story' ? 2 :
        taskCount

      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          languageId: selectedLang,
          ruleIds: Array.from(selectedRules),
          taskCount: effectiveTaskCount,
          includeVocab,
          mode: effectiveMode,
          paragraphCount: effectiveMode === 'story' ? paragraphCount : undefined,
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
          useTheme: mode === 'chaos' || useTheme,
          allowedTypes: allowedTypes.size < ALL_TYPES.length ? Array.from(allowedTypes) : [],
          difficulty,
        }),
      })
      if (!genRes.ok) throw new Error('Failed to generate tasks')

      router.push(`/practice/session/${session.id}`)
    } catch {
      setError('Failed to create session. Check your API key.')
      setStarting(false)
    }
  }

  if (loadingLangs) return <p className="text-sm text-muted-foreground">Loading...</p>

  if (languages.length === 0) {
    return (
      <div className="max-w-md">
        <h1 className="text-xl font-semibold text-foreground mb-6">Practice</h1>
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <p className="text-2xl mb-2">🌍</p>
          <p className="text-sm font-medium text-foreground">Add a language first</p>
          <p className="text-xs text-muted-foreground mt-1">and at least one rule</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Practice</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure your session and start</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Language */}
        {languages.length > 1 && (
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Language</p>
            <div className="flex flex-wrap gap-2">
              {languages.map(lang => (
                <button
                  key={lang.id}
                  onClick={() => setSelectedLang(lang.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    selectedLang === lang.id
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted'
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
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rules</p>
              {rules.length > 0 && (
                <button
                  onClick={toggleAll}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {visibleRules.every(r => selectedRules.has(r.id)) ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>

            {/* Category filter */}
            {!loadingRules && categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                    selectedCategory === null
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                      selectedCategory === cat.id
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {loadingRules ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rules for this language</p>
            ) : visibleRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rules in this category</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {visibleRules.map(rule => {
                  const isWeak = (rule.emaScore ?? 0.5) < 0.6
                  const now = new Date()
                  const due = rule.nextReview ? new Date(rule.nextReview) : null
                  const isDueNow = !due || due <= now
                  const daysUntil = due && due > now
                    ? Math.ceil((due.getTime() - now.getTime()) / 86400000)
                    : 0
                  return (
                    <label
                      key={rule.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        selectedRules.has(rule.id) ? 'bg-muted' : 'hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRules.has(rule.id)}
                        onChange={() => toggleRule(rule.id)}
                        className="accent-primary w-4 h-4"
                      />
                      <span className="flex-1 text-sm text-foreground min-w-0">
                        {rule.title}
                        {isWeak && (
                          <span className="ml-2 text-xs bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 px-1.5 py-0.5 rounded">
                            weak
                          </span>
                        )}
                        {!isDueNow && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            in {daysUntil}d
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

        {/* Mode */}
        {selectedLang && rules.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Mode</p>
            <div className="flex flex-col gap-1.5">
              {MODES.map(m => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    mode === m.value
                      ? 'border-foreground bg-muted'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                    mode === m.value ? 'border-foreground bg-foreground' : 'border-muted-foreground'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Options */}
        {selectedLang && rules.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Options</p>

            <div className="flex flex-col gap-3">
              {/* Task count — hidden in story mode (always 2 tasks) */}
              {mode !== 'story' && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Number of tasks</p>
                  <div className="flex gap-2">
                    {TASK_COUNTS.map(n => (
                      <button
                        key={n}
                        onClick={() => setTaskCount(n)}
                        className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                          taskCount === n
                            ? 'bg-foreground text-background border-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Paragraph count — shown only in story mode */}
              {mode === 'story' && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Paragraphs per story</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setParagraphCount(n)}
                        className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                          paragraphCount === n
                            ? 'bg-foreground text-background border-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeVocab}
                  onChange={e => setIncludeVocab(e.target.checked)}
                  className="accent-primary w-4 h-4"
                />
                <span className="text-sm text-muted-foreground">Include vocabulary tasks</span>
              </label>

              {mode !== 'chaos' && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useTheme}
                    onChange={e => setUseTheme(e.target.checked)}
                    className="accent-primary w-4 h-4"
                  />
                  <span className="text-sm text-muted-foreground">Use a contextual theme</span>
                </label>
              )}

              {/* Task types */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">Task types</p>
                  <button
                    onClick={() => setAllowedTypes(
                      allowedTypes.size === ALL_TYPES.length ? new Set() : new Set(ALL_TYPES)
                    )}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {allowedTypes.size === ALL_TYPES.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_TYPES.filter(t => t !== 'vocabulary' || includeVocab).map(type => (
                    <button
                      key={type}
                      onClick={() => {
                        setAllowedTypes(prev => {
                          const next = new Set(prev)
                          next.has(type) ? next.delete(type) : next.add(type)
                          return next.size === 0 ? new Set(ALL_TYPES) : next
                        })
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                        allowedTypes.has(type)
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {TASK_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Difficulty</p>
                <div className="flex gap-2">
                  {([
                    { value: 'any', label: 'Auto' },
                    { value: 'easy', label: 'Easy' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'hard', label: 'Hard' },
                  ] as { value: DifficultyLevel; label: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setDifficulty(opt.value)}
                      className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                        difficulty === opt.value
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {error && (
          <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-xs">{error}</p>
        )}

        {selectedLang && rules.length > 0 && (
          <button
            onClick={handleStart}
            disabled={starting || selectedRules.size === 0}
            className="bg-primary text-primary-foreground rounded-xl py-3 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {starting
            ? 'Generating tasks...'
            : mode === 'story'
              ? `Start story · ${paragraphCount} paragraph${paragraphCount !== 1 ? 's' : ''}`
              : `Start ${mode} · ${taskCount} tasks`}
          </button>
        )}
      </div>
    </div>
  )
}