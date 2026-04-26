'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
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

type Rule = {
  id: string
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

export default function RulesPage() {
  const { id: languageId } = useParams<{ id: string }>()

  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [formula, setFormula] = useState('')
  const [type, setType] = useState<RuleType>('rule')
  const [aiContext, setAiContext] = useState('')
  const [difficulty, setDifficulty] = useState(3)
  const [examples, setExamples] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [hint, setHint] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState('')

  useEffect(() => {
    fetch(`/api/rules?languageId=${languageId}`)
      .then(r => r.json())
      .then(data => { setRules(data); setLoading(false) })
  }, [languageId])

  function resetForm() {
    setTitle(''); setDescription(''); setFormula('')
    setType('rule'); setAiContext(''); setDifficulty(3); setExamples('')
    setSaveError(''); setHint(''); setSuggestError('')
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

    const payload = {
      languageId,
      title,
      description: description || null,
      formula: formula || null,
      type,
      aiContext: aiContext || null,
      difficulty,
      examples: examples
        ? examples.split('\n').map(s => s.trim()).filter(Boolean)
        : [],
    }

    if (editingId) {
      const res = await fetch('/api/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...payload }),
      })

      if (!res.ok) {
        setSaveError('Failed to save rule')
        setSaving(false)
        return
      }

      const updated = await res.json()
      setRules(prev => prev.map(r => r.id === editingId ? { ...r, ...updated } : r))
    } else {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        setSaveError('Failed to save rule')
        setSaving(false)
        return
      }

      const rule = await res.json()
      setRules(prev => [{ ...rule, emaScore: 0.5, weakFlag: false }, ...prev])
    }

    resetForm()
    setShowModal(false)
    setSaving(false)
  }

  async function handleDelete(ruleId: string) {
    await fetch(`/api/rules?id=${ruleId}`, { method: 'DELETE' })
    setRules(prev => prev.filter(r => r.id !== ruleId))
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>

  return (
    <>
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Overview / Rules</p>
            <h1 className="text-xl font-semibold">Rules</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/languages/${languageId}/optimize`}>
              <Button variant="outline">Optimize rules</Button>
            </Link>
            <Button onClick={() => { resetForm(); setShowModal(true) }}>
              + Add
            </Button>
          </div>
        </div>

        {rules.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-3xl mb-2">📖</p>
              <p className="text-sm font-medium">No rules yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Add your first rule to start generating exercises</p>
              <Button onClick={() => { resetForm(); setShowModal(true) }}>
                + Add rule
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {rules.map(rule => (
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
                    {rule.description && (
                      <p className="text-sm text-muted-foreground">{rule.description}</p>
                    )}
                    {rule.formula && (
                      <div className="bg-muted rounded-lg px-3 py-2 text-sm font-mono">
                        {rule.formula}
                      </div>
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
                      <span className="text-xs text-muted-foreground">
                        Difficulty: {DIFFICULTY_LABELS[rule.difficulty]}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => openEdit(rule)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(rule.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

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
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSuggest}
                  disabled={suggesting || !hint.trim()}
                >
                  {suggesting ? '...' : '✨'}
                </Button>
              </div>
              {suggestError && (
                <p className="text-destructive text-xs">{suggestError}</p>
              )}
            </div>

            {/* Type */}
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <div className="flex gap-2">
                {(Object.entries(TYPE_LABELS) as [RuleType, string][]).map(([val, label]) => (
                  <Button
                    key={val}
                    type="button"
                    variant={type === val ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setType(val)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-title">Title *</Label>
              <textarea
                id="rule-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Present Perfect"
                required
                autoFocus
                rows={1}
                className={textareaClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-desc">Description</Label>
              <textarea
                id="rule-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief rule description..."
                rows={2}
                className={textareaClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-formula">Formula / structure</Label>
              <textarea
                id="rule-formula"
                value={formula}
                onChange={e => setFormula(e.target.value)}
                placeholder="have/has + V3"
                rows={1}
                className={`${textareaClass} font-mono`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-examples">
                Examples <span className="normal-case font-normal text-muted-foreground">(one per line)</span>
              </Label>
              <textarea
                id="rule-examples"
                value={examples}
                onChange={e => setExamples(e.target.value)}
                placeholder={"I have seen this movie.\nShe has visited Paris."}
                rows={3}
                className={textareaClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-context">AI Context</Label>
              <textarea
                id="rule-context"
                value={aiContext}
                onChange={e => setAiContext(e.target.value)}
                placeholder="Additional instructions for exercise generation..."
                rows={2}
                className={textareaClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-diff">
                Difficulty — {DIFFICULTY_LABELS[difficulty]}
              </Label>
              <input
                id="rule-diff"
                type="range"
                min={1}
                max={5}
                value={difficulty}
                onChange={e => setDifficulty(Number(e.target.value))}
                className="accent-primary"
              />
            </div>

            {saveError && (
              <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-xs">{saveError}</p>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}