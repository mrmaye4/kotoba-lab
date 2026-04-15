'use client'

import { useEffect, useState } from 'react'

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

export default function SettingsPage() {
  const [interfaceLanguage, setInterfaceLanguage] = useState('en')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setInterfaceLanguage(data.interfaceLanguage ?? 'en')
        setLoading(false)
      })
  }, [])

  async function handleSave(code: string) {
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

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your preferences</p>
      </div>

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
              onClick={() => handleSave(lang.code)}
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
          <p className="text-xs text-muted-foreground mt-3">
            {saving ? 'Saving...' : 'Saved'}
          </p>
        )}
      </div>
    </div>
  )
}