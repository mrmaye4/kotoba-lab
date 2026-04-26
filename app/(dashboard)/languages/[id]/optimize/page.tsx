'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Phase = 'setup' | 'analyzing' | 'review' | 'generating' | 'applying'

type SourceRule = { id: string; title: string; type: string; difficulty: number }

type Group = {
  id: string
  name: string
  sourceRuleIds: string[]
  sourceRules: SourceRule[]
  excluded: boolean
  mergedTitle: string | null
  mergedDescription: string | null
  mergedFormula: string | null
  mergedType: string | null
  mergedAiContext: string | null
  mergedDifficulty: number | null
  mergedExamples: string[] | null
  generationStatus: string
}

type Category = { id: string; name: string }

const textareaClass = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y transition-colors"

export default function OptimizePage() {
  const { id: languageId } = useParams<{ id: string }>()
  const router = useRouter()

  const [phase, setPhase] = useState<Phase>('setup')
  const [categories, setCategories] = useState<Category[]>([])
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [ungroupedRules, setUngroupedRules] = useState<SourceRule[]>([])
  const [error, setError] = useState('')
  const [ruleCount, setRuleCount] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/rules/categories?languageId=${languageId}`).then(r => r.json()),
      fetch(`/api/rules?languageId=${languageId}`).then(r => r.json()),
    ]).then(([cats, rulesData]) => {
      setCategories(Array.isArray(cats) ? cats : [])
      setRuleCount(Array.isArray(rulesData) ? rulesData.length : 0)
    })
  }, [languageId])

  async function handleAnalyze() {
    setError('')
    setPhase('analyzing')
    const res = await fetch('/api/optimize/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languageId, filterCategoryId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error || 'Analysis failed')
      setPhase('setup')
      return
    }
    const { sessionId: sid } = await res.json()
    setSessionId(sid)

    const sessionRes = await fetch(`/api/optimize/${sid}`)
    const sessionData = await sessionRes.json()
    setGroups(sessionData.groups)
    setUngroupedRules(sessionData.ungroupedRules)
    setPhase('review')
  }

  async function handleGenerate() {
    if (!sessionId) return
    setError('')
    setPhase('generating')

    await Promise.all(
      groups.map(g =>
        fetch(`/api/optimize/${sessionId}/groups`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupId: g.id,
            name: g.name,
            sourceRuleIds: g.sourceRuleIds,
            excluded: g.excluded,
          }),
        })
      )
    )

    const res = await fetch(`/api/optimize/${sessionId}/generate`, { method: 'POST' })
    if (!res.ok) {
      setError('Generation failed')
      setPhase('review')
      return
    }

    const sessionRes = await fetch(`/api/optimize/${sessionId}`)
    const sessionData = await sessionRes.json()
    setGroups(sessionData.groups)
    setPhase('review')
  }

  async function handleApply() {
    if (!sessionId) return
    setError('')
    setPhase('applying')

    await Promise.all(
      groups
        .filter(g => !g.excluded && g.mergedTitle)
        .map(g =>
          fetch(`/api/optimize/${sessionId}/groups`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groupId: g.id,
              mergedTitle: g.mergedTitle,
              mergedDescription: g.mergedDescription,
              mergedFormula: g.mergedFormula,
              mergedType: g.mergedType,
              mergedAiContext: g.mergedAiContext,
              mergedDifficulty: g.mergedDifficulty,
              mergedExamples: g.mergedExamples,
            }),
          })
        )
    )

    const res = await fetch(`/api/optimize/${sessionId}/apply`, { method: 'POST' })
    if (!res.ok) {
      setError('Apply failed')
      setPhase('review')
      return
    }
    router.push(`/languages/${languageId}/rules`)
  }

  function updateGroup(id: string, patch: Partial<Group>) {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g))
  }

  function removeRuleFromGroup(groupId: string, ruleId: string) {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    const removedRule = group.sourceRules.find(r => r.id === ruleId)
    if (removedRule) setUngroupedRules(prev => [...prev, removedRule])
    updateGroup(groupId, {
      sourceRuleIds: group.sourceRuleIds.filter(id => id !== ruleId),
      sourceRules: group.sourceRules.filter(r => r.id !== ruleId),
    })
  }

  const hasGenerated = groups.some(g => !g.excluded && g.generationStatus === 'done')
  const activeGroupCount = groups.filter(g => !g.excluded).length
  const archivedRuleCount = groups.filter(g => !g.excluded).flatMap(g => g.sourceRuleIds).length

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Rules / Optimize</p>
          <h1 className="text-xl font-semibold">Optimize rules</h1>
        </div>
        <Button variant="outline" onClick={() => router.push(`/languages/${languageId}/rules`)}>
          Cancel
        </Button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
      )}

      {phase === 'setup' && (
        <Card>
          <CardContent className="py-6 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              AI will semantically group similar rules and generate one consolidated rule per group.
              Original rules will be archived.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Rules to analyze</label>
              <select
                value={filterCategoryId ?? ''}
                onChange={e => setFilterCategoryId(e.target.value || null)}
                className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none"
              >
                <option value="">All rules {ruleCount !== null ? `(${ruleCount})` : ''}</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <Button onClick={handleAnalyze}>Analyze</Button>
          </CardContent>
        </Card>
      )}

      {phase === 'analyzing' && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium mb-1">Grouping rules...</p>
            <p className="text-xs text-muted-foreground">AI is finding semantic groups. This takes ~10 seconds.</p>
          </CardContent>
        </Card>
      )}

      {phase === 'generating' && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium mb-1">Generating merged rules...</p>
            <p className="text-xs text-muted-foreground">Creating one rule per group. This takes ~{activeGroupCount * 3} seconds.</p>
          </CardContent>
        </Card>
      )}

      {phase === 'applying' && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Applying optimization...</p>
          </CardContent>
        </Card>
      )}

      {phase === 'review' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Found {groups.length} groups.{ungroupedRules.length > 0 && ` ${ungroupedRules.length} rules are ungrouped and won't be changed.`}
          </p>

          {groups.map(group => (
            <Card key={group.id} className={group.excluded ? 'opacity-50' : ''}>
              <CardContent className="py-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <input
                    value={group.name}
                    onChange={e => updateGroup(group.id, { name: e.target.value })}
                    className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent hover:border-border focus:border-ring"
                  />
                  <button
                    type="button"
                    onClick={() => updateGroup(group.id, { excluded: !group.excluded })}
                    className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
                  >
                    {group.excluded ? 'Include' : 'Exclude'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {group.sourceRules.map(rule => (
                    <span key={rule.id} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md">
                      {rule.title}
                      <button
                        type="button"
                        onClick={() => removeRuleFromGroup(group.id, rule.id)}
                        className="text-muted-foreground hover:text-destructive leading-none"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>

                {group.generationStatus === 'done' && group.mergedTitle && (
                  <div className="flex flex-col gap-2 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Merged rule</p>
                    <input
                      value={group.mergedTitle}
                      onChange={e => updateGroup(group.id, { mergedTitle: e.target.value })}
                      className="text-sm font-medium bg-transparent outline-none border-b border-transparent hover:border-border focus:border-ring"
                      placeholder="Title"
                    />
                    <textarea
                      value={group.mergedDescription ?? ''}
                      onChange={e => updateGroup(group.id, { mergedDescription: e.target.value || null })}
                      placeholder="Description"
                      rows={2}
                      className={textareaClass}
                    />
                    {group.mergedFormula && (
                      <input
                        value={group.mergedFormula}
                        onChange={e => updateGroup(group.id, { mergedFormula: e.target.value || null })}
                        className="text-sm font-mono bg-muted rounded px-2 py-1 outline-none"
                        placeholder="Formula"
                      />
                    )}
                  </div>
                )}

                {group.generationStatus === 'error' && (
                  <p className="text-xs text-destructive">Generation failed for this group.</p>
                )}
              </CardContent>
            </Card>
          ))}

          {ungroupedRules.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ungrouped — will not be changed
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ungroupedRules.map(r => (
                  <span key={r.id} className="text-xs bg-muted px-2 py-0.5 rounded-md text-muted-foreground">{r.title}</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {!hasGenerated ? (
              <Button onClick={handleGenerate} className="flex-1" disabled={groups.every(g => g.excluded)}>
                Generate merged rules
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleGenerate} className="flex-1">
                  Regenerate
                </Button>
                <Button onClick={handleApply} className="flex-1">
                  Apply — {activeGroupCount} groups, {archivedRuleCount} rules archived
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}