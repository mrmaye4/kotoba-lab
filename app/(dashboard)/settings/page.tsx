'use client'

import { useEffect, useState } from 'react'
import type { SessionMode, DifficultyLevel } from '@/types'

const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ru', label: 'Russian', native: 'Русский' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'de', label: 'German', native: 'Deutsch' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'it', label: 'Italian', native: 'Italiano' },
  { code: 'pl', label: 'Polish', native: 'Polski' },
  { code: 'uk', label: 'Ukrainian', native: 'Українська' },
  { code: 'zh', label: 'Chinese', native: '中文' },
  { code: 'ja', label: 'Japanese', native: '日本語' },
  { code: 'ko', label: 'Korean', native: '한국어' },
  { code: 'tr', label: 'Turkish', native: 'Türkçe' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
]

const DAILY_MODES: { value: SessionMode; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'test', label: 'Test' },
  { value: 'chaos', label: 'Chaos' },
  { value: 'story', label: 'Story' },
]

const DIFFICULTIES: { value: DifficultyLevel; label: string }[] = [
  { value: 'any', label: 'Auto' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

type DailySettings = {
  maxRules: number
  mode: SessionMode
  taskCount: number
  difficulty: DifficultyLevel
  includeVocab: boolean
}

const DEFAULT_DAILY: DailySettings = {
  maxRules: 10,
  mode: 'practice',
  taskCount: 10,
  difficulty: 'any',
  includeVocab: false,
}

export default function SettingsPage() {
  const [interfaceLanguage, setInterfaceLanguage] = useState('en')
  const [daily, setDaily] = useState<DailySettings>(DEFAULT_DAILY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dailySaving, setDailySaving] = useState(false)
  const [dailySaved, setDailySaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setInterfaceLanguage(data.interfaceLanguage ?? 'en')
        setDaily({ ...DEFAULT_DAILY, ...(data.dailyPractice ?? {}) })
        setLoading(false)
      })
  }, [])

  async function saveInterfaceLanguage(code: string) {
    setInterfaceLanguage(code)
    setSaving(true)
    setSaved(false)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interfaceLanguage: code }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveDaily(next: DailySettings) {
    setDaily(next)
    setDailySaving(true)
    setDailySaved(false)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyPractice: next }),
    })
    setDailySaving(false)
    setDailySaved(true)
    setTimeout(() => setDailySaved(false), 2000)
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>

  return (
    <div className="max-w-lg flex flex-col gap-4">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your preferences</p>
      </div>

      {/* Interface language */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="mb-4">
          <p className="text-sm font-medium text-foreground">Interface language</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Task instructions, translate prompts, and feedback will be in this language
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => saveInterfaceLanguage(lang.code)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                interfaceLanguage === lang.code
                  ? 'border-foreground bg-muted'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                interfaceLanguage === lang.code ? 'bg-foreground' : 'bg-muted-foreground/30'
              }`} />
              <div>
                <p className="text-sm text-foreground leading-none">{lang.native}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{lang.label}</p>
              </div>
            </button>
          ))}
        </div>

        {(saving || saved) && (
          <p className="text-xs text-muted-foreground mt-3">{saving ? 'Saving...' : 'Saved'}</p>
        )}
      </div>

      {/* Daily practice */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="mb-4">
          <p className="text-sm font-medium text-foreground">Daily practice</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Settings used when you start a daily review from the dashboard
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* Max rules */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Max rules per session</p>
            <div className="flex gap-2">
              {[5, 10, 15, 20].map(n => (
                <button
                  key={n}
                  onClick={() => saveDaily({ ...daily, maxRules: n })}
                  className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                    daily.maxRules === n
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Mode</p>
            <div className="flex gap-2">
              {DAILY_MODES.map(m => (
                <button
                  key={m.value}
                  onClick={() => saveDaily({ ...daily, mode: m.value })}
                  className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                    daily.mode === m.value
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Task count */}
          {daily.mode !== 'story' && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Tasks per session</p>
              <div className="flex gap-2">
                {[5, 10, 15, 20].map(n => (
                  <button
                    key={n}
                    onClick={() => saveDaily({ ...daily, taskCount: n })}
                    className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                      daily.taskCount === n
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

          {/* Difficulty */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Difficulty</p>
            <div className="flex gap-2">
              {DIFFICULTIES.map(d => (
                <button
                  key={d.value}
                  onClick={() => saveDaily({ ...daily, difficulty: d.value })}
                  className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                    daily.difficulty === d.value
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Include vocab */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={daily.includeVocab}
              onChange={e => saveDaily({ ...daily, includeVocab: e.target.checked })}
              className="accent-primary w-4 h-4"
            />
            <span className="text-sm text-muted-foreground">Include vocabulary tasks</span>
          </label>
        </div>

        {(dailySaving || dailySaved) && (
          <p className="text-xs text-muted-foreground mt-3">{dailySaving ? 'Saving...' : 'Saved'}</p>
        )}
      </div>
    </div>
  )
}