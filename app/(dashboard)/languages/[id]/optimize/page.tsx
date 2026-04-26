'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Phase = 'setup' | 'analyzing' | 'review'

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
  generating?: boolean
}

type Category = { id: string; name: string }

const inputClass = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors"
const textareaClass = inputClass + " resize-y"

const DIFFICULTY_LABELS: Record<number, string> = {
  1: '1 — Beginner', 2: '2 — Elementary', 3: '3 — Intermediate', 4: '4 — Upper-intermediate', 5: '5 — Advanced',
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
  const [addingRuleTo, setAddingRuleTo] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
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
    setGroups(sessionData.groups.map((g: Omit<Group, 'deleted' | 'generating'>) => ({ ...g, deleted: false, generating: false })))
    setUngroupedRules(sessionData.ungroupedRules)
    setPhase('review')
  }

  async function generateGroup(groupId: string) {
    if (!sessionId) return
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, generating: true } : g))

    const res = await fetch(`/api/optimize/${sessionId}/groups/${groupId}/generate`, { method: 'POST' })
    if (!res.ok) {
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, generating: false, generationStatus: 'error' } : g))
      return
    }
    const updated = await res.json()
    setGroups(prev => prev.map(g => g.id === groupId ? {
      ...g,
      generating: false,
      generationStatus: updated.generationStatus,
      mergedTitle: updated.mergedTitle,
      mergedDescription: updated.mergedDescription,
      mergedFormula: updated.mergedFormula,
      mergedType: updated.mergedType,
      mergedAiContext: updated.mergedAiContext,
      mergedDifficulty: updated.mergedDifficulty,
      mergedExamples: updated.mergedExamples,
    } : g))
  }

  async function handleApply() {
    if (!sessionId) return
    setError('')
    setApplying(true)

    const activeGroups = groups.filter(g => !g.excluded && !g.deleted && g.mergedTitle)

    // Sync all edits first
    await Promise.all([
      ...activeGroups.map(g =>
        fetch(`/api/optimize/${sessionId}/groups`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupId: g.id,
            name: g.name,
            sourceRuleIds: g.sourceRuleIds,
            excluded: false,
            mergedTitle: g.mergedTitle,
            mergedDescription: g.mergedDescription,
            mergedFormula: g.mergedFormula,
            mergedType: g.mergedType,
            mergedAiContext: g.mergedAiContext,
            mergedDifficulty: g.mergedDifficulty,
            mergedExamples: g.mergedExamples,
          }),
        })
      ),
      ...groups.filter(g => g.excluded || g.deleted).map(g =>
        fetch(`/api/optimize/${sessionId}/groups`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId: g.id, excluded: true }),
        })
      ),
    ])

    const res = await fetch(`/api/optimize/${sessionId}/apply`, { method: 'POST' })
    if (!res.ok) {
      setError('Apply failed')
      setApplying(false)
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
    const removed = group.sourceRules.find(r => r.id === ruleId)
    if (removed) setUngroupedRules(prev => [...prev, removed])
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
    setAddingRuleTo(null)
  }

  function excludeGroup(groupId: string) {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    setUngroupedRules(prev => [...prev, ...group.sourceRules])
    updateGroup(groupId, { excluded: true, sourceRuleIds: [], sourceRules: [] })
  }

  function deleteGroup(groupId: string) {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    setUngroupedRules(prev => [...prev, ...group.sourceRules])
    updateGroup(groupId, { deleted: true, excluded: true, sourceRuleIds: [], sourceRules: [] })
  }

  function restoreGroup(groupId: string) {
    updateGroup(groupId, { excluded: false, deleted: false })
  }

  function updateExample(groupId: string, index: number, value: string) {
    const group = groups.find(g => g.id === groupId)
    if (!group?.mergedExamples) return
    const updated = [...group.mergedExamples]
    updated[index] = value
    updateGroup(groupId, { mergedExamples: updated })
  }

  function addExample(groupId: string) {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    updateGroup(groupId, { mergedExamples: [...(group.mergedExamples ?? []), ''] })
  }

  function removeExample(groupId: string, index: number) {
    const group = groups.find(g => g.id === groupId)
    if (!group?.mergedExamples) return
    updateGroup(groupId, { mergedExamples: group.mergedExamples.filter((_, i) => i !== index) })
  }

  const activeGroups = groups.filter(g => !g.excluded && !g.deleted)
  const excludedGroups = groups.filter(g => g.excluded && !g.deleted)
  const hasAnyGenerated = activeGroups.some(g => g.generationStatus === 'done')
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

      {/* Setup */}
      {phase === 'setup' && (
        <Card>
          <CardContent className="py-6 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              AI will semantically group similar rules, then you generate a merged rule per group.
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

      {/* Analyzing */}
      {phase === 'analyzing' && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium mb-1">Grouping rules...</p>
            <p className="text-xs text-muted-foreground">AI is finding semantic groups. This takes ~10 seconds.</p>
          </CardContent>
        </Card>
      )}

      {/* Applying */}
      {applying && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Applying optimization...</p>
          </CardContent>
        </Card>
      )}

      {/* Review */}
      {phase === 'review' && !applying && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {activeGroups.length} groups.{ungroupedRules.length > 0 && ` ${ungroupedRules.length} rules ungrouped — won't be changed.`}
          </p>

          {activeGroups.map(group => (
            <Card key={group.id}>
              <CardContent className="py-4 flex flex-col gap-3">
                {/* Group header */}
                <div className="flex items-start justify-between gap-2">
                  <input
                    value={group.name}
                    onChange={e => updateGroup(group.id, { name: e.target.value })}
                    className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent hover:border-border focus:border-ring"
                  />
                  <div className="flex items-center gap-3 shrink-0">
                    <button type="button" onClick={() => excludeGroup(group.id)} className="text-xs text-muted-foreground hover:text-foreground">Exclude</button>
                    <button type="button" onClick={() => deleteGroup(group.id)} className="text-xs text-muted-foreground hover:text-destructive">Delete</button>
                  </div>
                </div>

                {/* Source rules chips */}
                <div className="flex flex-wrap gap-1.5">
                  {group.sourceRules.map(rule => (
                    <span key={rule.id} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md">
                      {rule.title}
                      <button type="button" onClick={() => removeRuleFromGroup(group.id, rule.id)} className="text-muted-foreground hover:text-destructive leading-none">✕</button>
                    </span>
                  ))}
                  {ungroupedRules.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAddingRuleTo(addingRuleTo === group.id ? null : group.id)}
                      className="text-xs bg-muted/50 border border-dashed border-border px-2 py-0.5 rounded-md text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                    >
                      {addingRuleTo === group.id ? '✕ Cancel' : '+ Add rule'}
                    </button>
                  )}
                </div>

                {/* Inline add-rule picker */}
                {addingRuleTo === group.id && (
                  <div className="flex flex-wrap gap-1.5 pt-1 pb-0.5 border-t border-dashed">
                    <p className="w-full text-xs text-muted-foreground mb-0.5">Click a rule to add it to this group:</p>
                    {ungroupedRules.map(rule => (
                      <button
                        key={rule.id}
                        type="button"
                        onClick={() => addRuleToGroup(group.id, rule)}
                        className="text-xs bg-background border border-border px-2 py-0.5 rounded-md hover:bg-muted transition-colors"
                      >
                        {rule.title}
                      </button>
                    ))}
                  </div>
                )}

                {/* Generate button */}
                <div className="flex items-center gap-2">
                  {group.generating ? (
                    <span className="text-xs text-muted-foreground">Generating...</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => generateGroup(group.id)}
                      className="text-xs text-muted-foreground border border-dashed border-border px-3 py-1 rounded-lg hover:border-foreground hover:text-foreground transition-colors"
                    >
                      {group.generationStatus === 'done' ? 'Regenerate' : group.generationStatus === 'error' ? 'Retry generation' : 'Generate merged rule'}
                    </button>
                  )}
                  {group.generationStatus === 'error' && !group.generating && (
                    <span className="text-xs text-destructive">Generation failed</span>
                  )}
                </div>

                {/* Merged rule fields */}
                {group.generationStatus === 'done' && group.mergedTitle && (
                  <div className="flex flex-col gap-3 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Merged rule</p>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Title</label>
                      <input
                        value={group.mergedTitle}
                        onChange={e => updateGroup(group.id, { mergedTitle: e.target.value })}
                        className={inputClass}
                        placeholder="Title"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Description</label>
                      <textarea
                        value={group.mergedDescription ?? ''}
                        onChange={e => updateGroup(group.id, { mergedDescription: e.target.value || null })}
                        placeholder="Description"
                        rows={3}
                        className={textareaClass}
                      />
                    </div>

                    <div className="flex gap-3">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-muted-foreground">Type</label>
                        <select
                          value={group.mergedType ?? 'rule'}
                          onChange={e => updateGroup(group.id, { mergedType: e.target.value })}
                          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none"
                        >
                          <option value="rule">Rule</option>
                          <option value="structure">Structure</option>
                          <option value="collocation">Collocation</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-muted-foreground">Difficulty</label>
                        <select
                          value={group.mergedDifficulty ?? 3}
                          onChange={e => updateGroup(group.id, { mergedDifficulty: Number(e.target.value) })}
                          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none"
                        >
                          {[1, 2, 3, 4, 5].map(d => (
                            <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Formula</label>
                      <input
                        value={group.mergedFormula ?? ''}
                        onChange={e => updateGroup(group.id, { mergedFormula: e.target.value || null })}
                        className={`font-mono ${inputClass}`}
                        placeholder="e.g. Subject + Verb + Object (optional)"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">AI context</label>
                      <textarea
                        value={group.mergedAiContext ?? ''}
                        onChange={e => updateGroup(group.id, { mergedAiContext: e.target.value || null })}
                        placeholder="Hints for exercise generation (optional)"
                        rows={2}
                        className={textareaClass}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted-foreground">Examples</label>
                      {(group.mergedExamples ?? []).map((ex, i) => (
                        <div key={i} className="flex gap-1.5">
                          <input
                            value={ex}
                            onChange={e => updateExample(group.id, i, e.target.value)}
                            className={inputClass}
                            placeholder={`Example ${i + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => removeExample(group.id, i)}
                            className="text-muted-foreground hover:text-destructive px-1 shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addExample(group.id)}
                        className="text-xs text-muted-foreground hover:text-foreground self-start"
                      >
                        + Add example
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Excluded groups */}
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
                    <div key={group.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 opacity-60">
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

          {/* Ungrouped */}
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

          {/* Apply */}
          {hasAnyGenerated && (
            <Button onClick={handleApply} className="w-full">
              Apply — {activeGroups.filter(g => g.generationStatus === 'done').length} groups, {archivedRuleCount} rules archived
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
