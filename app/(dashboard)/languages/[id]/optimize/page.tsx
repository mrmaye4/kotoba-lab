'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
  deleted: boolean
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

function AddRuleDropdown({
  ungroupedRules,
  onAdd,
}: {
  ungroupedRules: SourceRule[]
  onAdd: (rule: SourceRule) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (ungroupedRules.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs bg-muted/50 border border-dashed border-border px-2 py-0.5 rounded-md text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
      >
        + Add rule
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-10 bg-popover border border-border rounded-lg shadow-md py-1 min-w-48 max-h-48 overflow-y-auto">
          {ungroupedRules.map(rule => (
            <button
              key={rule.id}
              type="button"
              onClick={() => { onAdd(rule); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
            >
              {rule.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function OptimizePage() {
  const { id: languageId } = useParams<{ id: string }>()
  const router = useRouter()

  const [phase, setPhase] = useState<Phase>('setup')
  const [categories, setCategories] = useState<Category[]>([])
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [ungroupedRules, setUngroupedRules] = useState<SourceRule[]>([])
  const [showExcluded, setShowExcluded] = useState(false)
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
    setGroups(sessionData.groups.map((g: Omit<Group, 'deleted'>) => ({ ...g, deleted: false })))
    setUngroupedRules(sessionData.ungroupedRules)
    setPhase('review')
  }

  async function handleGenerate() {
    if (!sessionId) return
    setError('')
    setPhase('generating')

    const activeGroups = groups.filter(g => !g.excluded && !g.deleted)

    await Promise.all(
      activeGroups.map(g =>
        fetch(`/api/optimize/${sessionId}/groups`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupId: g.id,
            name: g.name,
            sourceRuleIds: g.sourceRuleIds,
            excluded: false,
          }),
        })
      )
    )

    // Mark excluded/deleted groups as excluded on server
    const skippedGroups = groups.filter(g => g.excluded || g.deleted)
    await Promise.all(
      skippedGroups.map(g =>
        fetch(`/api/optimize/${sessionId}/groups`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId: g.id, excluded: true }),
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
    setGroups(prev => sessionData.groups.map((sg: Omit<Group, 'deleted'>) => {
      const existing = prev.find(g => g.id === sg.id)
      return { ...sg, deleted: existing?.deleted ?? false }
    }))
    setPhase('review')
  }

  async function handleApply() {
    if (!sessionId) return
    setError('')
    setPhase('applying')

    await Promise.all(
      groups
        .filter(g => !g.excluded && !g.deleted && g.mergedTitle)
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

  function addRuleToGroup(groupId: string, rule: SourceRule) {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    setUngroupedRules(prev => prev.filter(r => r.id !== rule.id))
    updateGroup(groupId, {
      sourceRuleIds: [...group.sourceRuleIds, rule.id],
      sourceRules: [...group.sourceRules, rule],
    })
  }

  function excludeGroup(groupId: string) {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    // Rules return to ungrouped
    setUngroupedRules(prev => [...prev, ...group.sourceRules])
    updateGroup(groupId, { excluded: true, sourceRuleIds: [], sourceRules: [] })
  }

  function restoreGroup(groupId: string) {
    updateGroup(groupId, { excluded: false, deleted: false })
  }

  function deleteGroup(groupId: string) {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    // Rules return to ungrouped
    setUngroupedRules(prev => [...prev, ...group.sourceRules])
    updateGroup(groupId, { deleted: true, excluded: true, sourceRuleIds: [], sourceRules: [] })
  }

  const activeGroups = groups.filter(g => !g.excluded && !g.deleted)
  const excludedGroups = groups.filter(g => (g.excluded || g.deleted) && !g.deleted)
  const hasGenerated = activeGroups.some(g => g.generationStatus === 'done')
  const archivedRuleCount = activeGroups.flatMap(g => g.sourceRuleIds).length

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
            <p className="text-xs text-muted-foreground">Creating one rule per group. This takes ~{activeGroups.length * 3} seconds.</p>
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
            {activeGroups.length} groups active.{ungroupedRules.length > 0 && ` ${ungroupedRules.length} rules ungrouped — won't be changed.`}
          </p>

          {/* Active groups */}
          {activeGroups.map(group => (
            <Card key={group.id}>
              <CardContent className="py-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <input
                    value={group.name}
                    onChange={e => updateGroup(group.id, { name: e.target.value })}
                    className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent hover:border-border focus:border-ring"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => excludeGroup(group.id)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Exclude
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteGroup(group.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Delete
                    </button>
                  </div>
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
                  <AddRuleDropdown
                    ungroupedRules={ungroupedRules}
                    onAdd={rule => addRuleToGroup(group.id, rule)}
                  />
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

          {/* Excluded groups (collapsed) */}
          {excludedGroups.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowExcluded(o => !o)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showExcluded ? '▾' : '▸'} Excluded ({excludedGroups.length})
              </button>
              {showExcluded && (
                <div className="flex flex-col gap-2 mt-2">
                  {excludedGroups.map(group => (
                    <div key={group.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 text-sm opacity-60">
                      <span className="text-sm">{group.name}</span>
                      <button
                        type="button"
                        onClick={() => restoreGroup(group.id)}
                        className="text-xs text-muted-foreground hover:text-foreground ml-4"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ungrouped rules */}
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
              <Button onClick={handleGenerate} className="flex-1" disabled={activeGroups.length === 0}>
                Generate merged rules
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleGenerate} className="flex-1">
                  Regenerate
                </Button>
                <Button onClick={handleApply} className="flex-1">
                  Apply — {activeGroups.length} groups, {archivedRuleCount} rules archived
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}