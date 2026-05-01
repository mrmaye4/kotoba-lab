'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DrillRuleStat } from '@/types'

type Language = { id: string; name: string; flagEmoji: string | null }

export default function DrillsPage() {
  const router = useRouter()
  const [languages, setLanguages] = useState<Language[]>([])
  const [selectedLang, setSelectedLang] = useState('')
  const [stats, setStats] = useState<DrillRuleStat[]>([])
  const [loadingLangs, setLoadingLangs] = useState(true)
  const [loadingStats, setLoadingStats] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/languages')
      .then(r => r.json())
      .then((data: Language[]) => {
        setLanguages(data)
        if (data.length === 1) setSelectedLang(data[0].id)
        setLoadingLangs(false)
      })
  }, [])

  useEffect(() => {
    if (!selectedLang) return
    setLoadingStats(true)
    fetch(`/api/drills?languageId=${selectedLang}`)
      .then(r => r.json())
      .then((data: DrillRuleStat[]) => {
        setStats(data)
        setLoadingStats(false)
      })
  }, [selectedLang])

  const totalDue = stats.reduce((sum, s) => sum + s.dueItems, 0)
  const dueRuleIds = stats.filter(s => s.dueItems > 0).map(s => s.ruleId)

  async function handleGenerate(ruleId: string) {
    setGenerating(ruleId)
    await fetch('/api/drills/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleId }),
    })
    const data: DrillRuleStat[] = await fetch(`/api/drills?languageId=${selectedLang}`).then(r => r.json())
    setStats(data)
    setGenerating(null)
  }

  if (loadingLangs) return <p className="text-sm text-muted-foreground">Loading...</p>

  if (languages.length === 0) {
    return (
      <div className="max-w-md">
        <h1 className="text-xl font-semibold text-foreground mb-6">Drills</h1>
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">Add a language first</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Drills</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Quick pattern practice with spaced repetition</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Language selector */}
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

        {selectedLang && (
          <>
            {/* Due banner */}
            {totalDue > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{totalDue} item{totalDue !== 1 ? 's' : ''} due</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">across {dueRuleIds.length} rule{dueRuleIds.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                  onClick={() => router.push(`/drills/session?ruleIds=${dueRuleIds.join(',')}&mode=due`)}
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Review all
                </button>
              </div>
            )}

            {/* Rule list */}
            <div className="bg-card rounded-xl border border-border divide-y divide-border">
              {loadingStats ? (
                <p className="text-sm text-muted-foreground p-4">Loading...</p>
              ) : stats.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">No rules found</p>
              ) : (
                stats.map(stat => (
                  <div key={stat.ruleId} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{stat.title}</p>
                      {stat.totalItems > 0 ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {stat.totalItems} items
                          {stat.dueItems > 0 && (
                            <span className="ml-1.5 text-red-500 dark:text-red-400">· {stat.dueItems} due</span>
                          )}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">No items yet</p>
                      )}
                    </div>
                    {stat.totalItems > 0 ? (
                      <button
                        onClick={() => router.push(`/drills/session?ruleIds=${stat.ruleId}&mode=${stat.dueItems > 0 ? 'due' : 'all'}`)}
                        className="px-3 py-1.5 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        Drill
                      </button>
                    ) : (
                      <button
                        onClick={() => handleGenerate(stat.ruleId)}
                        disabled={generating === stat.ruleId}
                        className="px-3 py-1.5 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        {generating === stat.ruleId ? 'Generating...' : 'Generate'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}