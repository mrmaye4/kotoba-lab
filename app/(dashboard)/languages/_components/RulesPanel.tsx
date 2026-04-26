'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type RuleType = 'rule' | 'structure' | 'collocation'

type Category = { id: string; name: string }

type Rule = {
  id: string
  categoryIds: string[]
  title: string
  description: string | null
  formula: string | null
  type: RuleType
  aiContext: string | null
  difficulty: number
  examples: string[]
  emaScore: number | null
  weakFlag: boolean | null
}

const TYPE_LABELS: Record<RuleType, string> = {
  rule: 'Rule',
  structure: 'Structure',
  collocation: 'Collocation',
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Easy',
  2: 'Below average',
  3: 'Medium',
  4: 'Hard',
  5: 'Very hard',
}

function CategoryInput({
  categories,
  values,
  onChange,
}: {
  categories: Category[]
  values: string[]
  onChange: (names: string[]) => void
}) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = input.trim()
    ? categories.filter(c =>
        c.name.toLowerCase().includes(input.toLowerCase()) &&
        !values.includes(c.name)
      )
    : categories.filter(c => !values.includes(c.name))

  const exactMatch = categories.some(c => c.name.toLowerCase() === input.trim().toLowerCase())
  const alreadySelected = values.some(v => v.toLowerCase() === input.trim().toLowerCase())

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function add(name: string) {
    if (!values.includes(name)) onChange([...values, name])
    setInput('')
    setOpen(false)
  }

  function remove(name: string) {
    onChange(values.filter(v => v !== name))
  }

  return (
    <div ref={ref} className="relative">
      <div
        className="flex flex-wrap gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 min-h-[38px] cursor-text"
        onClick={() => setOpen(true)}
      >
        {values.map(name => (
          <span key={name} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md">
            {name}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); remove(name) }}
              className="text-muted-foreground hover:text-foreground leading-none"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={values.length === 0 ? 'Type or pick a category…' : ''}
          autoComplete="off"
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && (filtered.length > 0 || (input.trim() && !exactMatch && !alreadySelected)) && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-md overflow-hidden">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              onMouseDown={e => { e.preventDefault(); add(c.name) }}
            >
              {c.name}
            </button>
          ))}
          {input.trim() && !exactMatch && !alreadySelected && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted transition-colors border-t border-border"
              onMouseDown={e => { e.preventDefault(); add(input.trim()) }}
            >
              Create <span className="font-medium">"{input.trim()}"</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function EmaBar({ score }: { score: number | null }) {
  const val = score ?? 0.5
  const color = val >= 0.75 ? 'bg-emerald-400' : val >= 0.5 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${val * 100}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{Math.round(val * 100)}%</span>
    </div>
  )
}

const textareaClass = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y transition-colors"

export default function RulesPanel({ languageId }: { languageId: string }) {
  const [rules, setRules] = useState<Rule[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [archivedRules, setArchivedRules] = useState<Rule[]>([])
  const [archivedLoaded, setArchivedLoaded] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Manage categories modal
  const [showManageCategories, setShowManageCategories] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)

  // Form fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [formula, setFormula] = useState('')
  const [type, setType] = useState<RuleType>('rule')
  const [aiContext, setAiContext] = useState('')
  const [difficulty, setDifficulty] = useState(3)
  const [examples, setExamples] = useState('')
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // AI suggest
  const [hint, setHint] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState('')


  useEffect(() => {
    setLoading(true)
    setActiveCategoryId(null)
    Promise.all([
      fetch(`/api/rules?languageId=${languageId}`).then(r => r.json()),
      fetch(`/api/rules/categories?languageId=${languageId}`).then(r => r.json()),
    ]).then(([rulesData, catsData]: [Rule[], Category[]]) => {
      setRules(rulesData)
      setCategories(catsData)
      setLoading(false)
    })
  }, [languageId])

  function resetForm() {
    setTitle(''); setDescription(''); setFormula('')
    setType('rule'); setAiContext(''); setDifficulty(3); setExamples('')
    setCategoryNames([]); setSaveError(''); setHint(''); setSuggestError('')
    setEditingId(null)
  }

  function openEdit(rule: Rule) {
    setEditingId(rule.id)
    setTitle(rule.title)
    setDescription(rule.description ?? '')
    setFormula(rule.formula ?? '')
    setType(rule.type)
    setAiContext(rule.aiContext ?? '')
    setDifficulty(rule.difficulty)
    setExamples(rule.examples.join('\n'))
    setCategoryNames(
      rule.categoryIds
        .map(id => categories.find(c => c.id === id)?.name)
        .filter((n): n is string => Boolean(n))
    )
    setSaveError(''); setHint(''); setSuggestError('')
    setShowModal(true)
  }

  async function handleSuggest() {
    if (!hint.trim()) return
    setSuggestError('')
    setSuggesting(true)
    const res = await fetch('/api/rules/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hint, languageId }),
    })
    setSuggesting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setSuggestError(data.error || 'Failed to generate')
      return
    }
    const data = await res.json()
    setTitle(data.title ?? '')
    setType(data.type ?? 'rule')
    setDifficulty(data.difficulty ?? 3)
    setDescription(data.description ?? '')
    setFormula(data.formula ?? '')
    setExamples(Array.isArray(data.examples) ? data.examples.join('\n') : '')
    setAiContext(data.aiContext ?? '')
    setHint('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    setSaving(true)

    // Resolve or create categories
    const resolvedCategoryIds: string[] = []
    for (const name of categoryNames) {
      const trimmed = name.trim()
      if (!trimmed) continue
      const existing = categories.find(c => c.name.toLowerCase() === trimmed.toLowerCase())
      if (existing) {
        resolvedCategoryIds.push(existing.id)
      } else {
        const res = await fetch('/api/rules/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ languageId, name: trimmed }),
        })
        if (res.ok) {
          const cat = await res.json()
          setCategories(prev => [...prev, cat])
          resolvedCategoryIds.push(cat.id)
        }
      }
    }

    const payload = {
      languageId,
      categoryIds: resolvedCategoryIds,
      title,
      description: description || null,
      formula: formula || null,
      type,
      aiContext: aiContext || null,
      difficulty,
      examples: examples ? examples.split('\n').map(s => s.trim()).filter(Boolean) : [],
    }
    if (editingId) {
      const res = await fetch('/api/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...payload }),
      })
      if (!res.ok) { setSaveError('Failed to save rule'); setSaving(false); return }
      const updated = await res.json()
      setRules(prev => prev.map(r => r.id === editingId ? { ...r, ...updated, categoryIds: resolvedCategoryIds } : r))
    } else {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { setSaveError('Failed to save rule'); setSaving(false); return }
      const rule = await res.json()
      setRules(prev => [{ ...rule, categoryIds: resolvedCategoryIds, emaScore: 0.5, weakFlag: false }, ...prev])
    }
    resetForm()
    setShowModal(false)
    setSaving(false)
  }

  async function handleDelete(ruleId: string) {
    await fetch(`/api/rules?id=${ruleId}`, { method: 'DELETE' })
    setRules(prev => prev.filter(r => r.id !== ruleId))
    setArchivedRules(prev => prev.filter(r => r.id !== ruleId))
  }

  async function handleArchive(ruleId: string) {
    await fetch('/api/rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ruleId, archived: true }),
    })
    const rule = rules.find(r => r.id === ruleId)
    setRules(prev => prev.filter(r => r.id !== ruleId))
    if (rule && archivedLoaded) setArchivedRules(prev => [rule, ...prev])
    setExpanded(null)
  }

  async function handleUnarchive(ruleId: string) {
    await fetch('/api/rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ruleId, archived: false }),
    })
    const rule = archivedRules.find(r => r.id === ruleId)
    setArchivedRules(prev => prev.filter(r => r.id !== ruleId))
    if (rule) setRules(prev => [rule, ...prev])
    setExpanded(null)
  }

  async function loadArchivedRules() {
    if (archivedLoaded) return
    const data = await fetch(`/api/rules?languageId=${languageId}&archived=true`).then(r => r.json())
    setArchivedRules(Array.isArray(data) ? data : [])
    setArchivedLoaded(true)
  }

  async function handleDeleteCategory(id: string) {
    await fetch(`/api/rules/categories?id=${id}`, { method: 'DELETE' })
    setCategories(prev => prev.filter(c => c.id !== id))
    setRules(prev => prev.map(r => ({ ...r, categoryIds: r.categoryIds.filter(cid => cid !== id) })))
    if (activeCategoryId === id) setActiveCategoryId(null)
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim()
    if (!name) return
    setCreatingCategory(true)
    const res = await fetch('/api/rules/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languageId, name }),
    })
    if (res.ok) {
      const cat = await res.json()
      setCategories(prev => [...prev, cat])
      setNewCategoryName('')
    }
    setCreatingCategory(false)
  }

  const filteredRules = showArchived
    ? archivedRules
    : activeCategoryId === 'none'
    ? rules.filter(r => r.categoryIds.length === 0)
    : activeCategoryId
    ? rules.filter(r => r.categoryIds.includes(activeCategoryId))
    : rules

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{rules.length} rules</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManageCategories(true)}
            className="px-3 py-1 rounded-lg text-xs text-muted-foreground border border-dashed border-border hover:border-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            Manage categories
          </button>
          <Link href={`/languages/${languageId}/optimize`}>
            <button className="px-3 py-1 rounded-lg text-xs text-muted-foreground border border-dashed border-border hover:border-foreground hover:text-foreground transition-colors whitespace-nowrap">
              Optimize rules
            </button>
          </Link>
          <Button onClick={() => { resetForm(); setShowModal(true) }}>+ Add</Button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4 pb-1">
        <button
          onClick={() => { setActiveCategoryId(null); setShowArchived(false) }}
          className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeCategoryId === null && !showArchived ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
        >
          All ({rules.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setActiveCategoryId(cat.id); setShowArchived(false) }}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeCategoryId === cat.id && !showArchived ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {cat.name} ({rules.filter(r => r.categoryIds.includes(cat.id)).length})
          </button>
        ))}
        {rules.filter(r => r.categoryIds.length === 0).length > 0 && (
          <button
            onClick={() => { setActiveCategoryId('none'); setShowArchived(false) }}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeCategoryId === 'none' && !showArchived ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            Uncategorized ({rules.filter(r => r.categoryIds.length === 0).length})
          </button>
        )}
        <button
          onClick={() => { setShowArchived(true); setActiveCategoryId(null); loadArchivedRules() }}
          className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${showArchived ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
        >
          Archived{archivedLoaded ? ` (${archivedRules.length})` : ''}
        </button>
      </div>

      {/* Rules list with scroll */}
      {filteredRules.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            {showArchived ? (
              <p className="text-sm text-muted-foreground">No archived rules</p>
            ) : (
              <>
                <p className="text-3xl mb-2">📖</p>
                <p className="text-sm font-medium">No rules yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Add your first rule to start generating exercises</p>
                <Button onClick={() => { resetForm(); setShowModal(true) }}>+ Add rule</Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredRules.map(rule => (
            <Card key={rule.id}>
              <CardContent
                className="pt-4 pb-4 flex items-start justify-between gap-3 cursor-pointer"
                onClick={() => setExpanded(expanded === rule.id ? null : rule.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium">{rule.title}</span>
                    {rule.weakFlag && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800">weak</Badge>
                    )}
                    {rule.categoryIds.length > 0 && activeCategoryId === null && rule.categoryIds.map(cid => (
                      <span key={cid} className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {categories.find(c => c.id === cid)?.name}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{TYPE_LABELS[rule.type]}</span>
                    <span className="text-border">·</span>
                    <EmaBar score={rule.emaScore} />
                  </div>
                </div>
                <span className="text-muted-foreground text-[10px] mt-1">{expanded === rule.id ? '▲' : '▼'}</span>
              </CardContent>

              {expanded === rule.id && (
                <div className="px-4 pb-4 border-t pt-3 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                  {rule.description && <p className="text-sm text-muted-foreground">{rule.description}</p>}
                  {rule.formula && (
                    <div className="bg-muted rounded-lg px-3 py-2 text-sm font-mono">{rule.formula}</div>
                  )}
                  {rule.examples && rule.examples.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Examples</p>
                      {rule.examples.map((ex, i) => (
                        <p key={i} className="text-sm text-muted-foreground">— {ex}</p>
                      ))}
                    </div>
                  )}
                  {rule.aiContext && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Context</p>
                      <p className="text-xs text-muted-foreground">{rule.aiContext}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">Difficulty: {DIFFICULTY_LABELS[rule.difficulty]}</span>
                    <div className="flex gap-1">
                      {showArchived ? (
                        <>
                          <Button variant="ghost" size="xs" onClick={() => handleUnarchive(rule.id)}>Unarchive</Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(rule.id)}
                          >
                            Delete
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="xs" onClick={() => openEdit(rule)}>Edit</Button>
                          <Button variant="ghost" size="xs" onClick={() => handleArchive(rule.id)}>Archive</Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(rule.id)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit rule dialog */}
      <Dialog open={showModal} onOpenChange={open => { setShowModal(open); if (!open) resetForm() }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit rule' : 'Add rule'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* AI suggest */}
            <div className="flex flex-col gap-1.5 bg-muted/50 rounded-lg p-3">
              <Label className="text-xs text-muted-foreground">Fill with AI</Label>
              <div className="flex gap-2 items-start">
                <textarea
                  value={hint}
                  onChange={e => setHint(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSuggest())}
                  placeholder="e.g. Present Perfect, phrasal verbs with get..."
                  disabled={suggesting}
                  rows={1}
                  className={textareaClass}
                />
                <Button type="button" variant="outline" onClick={handleSuggest} disabled={suggesting || !hint.trim()}>
                  {suggesting ? '...' : '✨'}
                </Button>
              </div>
              {suggestError && <p className="text-destructive text-xs">{suggestError}</p>}
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <CategoryInput
                categories={categories}
                values={categoryNames}
                onChange={setCategoryNames}
              />
              <p className="text-xs text-muted-foreground">Pick existing or type a new one — it'll be created automatically</p>
            </div>

            {/* Type */}
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <div className="flex gap-2">
                {(Object.entries(TYPE_LABELS) as [RuleType, string][]).map(([val, label]) => (
                  <Button key={val} type="button" variant={type === val ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setType(val)}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-title">Title *</Label>
              <textarea id="rule-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Present Perfect" required autoFocus rows={1} className={textareaClass} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-desc">Description</Label>
              <textarea id="rule-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief rule description..." rows={2} className={textareaClass} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-formula">Formula / structure</Label>
              <textarea id="rule-formula" value={formula} onChange={e => setFormula(e.target.value)} placeholder="have/has + V3" rows={1} className={`${textareaClass} font-mono`} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-examples">Examples <span className="normal-case font-normal text-muted-foreground">(one per line)</span></Label>
              <textarea id="rule-examples" value={examples} onChange={e => setExamples(e.target.value)} placeholder={"I have seen this movie.\nShe has visited Paris."} rows={3} className={textareaClass} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-context">AI Context</Label>
              <textarea id="rule-context" value={aiContext} onChange={e => setAiContext(e.target.value)} placeholder="Additional instructions for exercise generation..." rows={2} className={textareaClass} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-diff">Difficulty — {DIFFICULTY_LABELS[difficulty]}</Label>
              <input id="rule-diff" type="range" min={1} max={5} value={difficulty} onChange={e => setDifficulty(Number(e.target.value))} className="accent-primary" />
            </div>

            {saveError && <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-xs">{saveError}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update' : 'Save'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage categories dialog */}
      <Dialog open={showManageCategories} onOpenChange={open => { setShowManageCategories(open); if (!open) setNewCategoryName('') }}>
        <DialogContent className="sm:max-w-sm flex flex-col max-h-[80vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>Manage categories</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 min-h-0">
            {/* Create new */}
            <div className="flex gap-2 shrink-0">
              <input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
                placeholder="New category name…"
                className={textareaClass + ' resize-none'}
              />
              <Button type="button" onClick={handleCreateCategory} disabled={creatingCategory || !newCategoryName.trim()}>
                {creatingCategory ? '...' : 'Add'}
              </Button>
            </div>

            {/* Existing categories */}
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">No categories yet</p>
            ) : (
              <div className="flex flex-col gap-1 overflow-y-auto">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50">
                    <span className="text-sm">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{rules.filter(r => r.categoryIds.includes(cat.id)).length} rules</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="text-muted-foreground hover:text-destructive text-xs transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </>
  )
}