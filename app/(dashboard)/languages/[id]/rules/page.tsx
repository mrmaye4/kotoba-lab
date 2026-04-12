'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  rule: 'Правило',
  structure: 'Структура',
  collocation: 'Словосо��етание',
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Лёгкое',
  2: 'Ниже среднего',
  3: 'Среднее',
  4: 'Сложное',
  5: 'Очень сложное',
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

const textareaClass = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none transition-colors"

export default function RulesPage() {
  const { id: languageId } = useParams<{ id: string }>()

  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
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

  useEffect(() => {
    fetch(`/api/rules?languageId=${languageId}`)
      .then(r => r.json())
      .then(data => { setRules(data); setLoading(false) })
  }, [languageId])

  function resetForm() {
    setTitle(''); setDescription(''); setFormula('')
    setType('rule'); setAiContext(''); setDifficulty(3); setExamples('')
    setSaveError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    setSaving(true)

    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
    })

    if (!res.ok) {
      setSaveError('Не удалось сохранить правило')
      setSaving(false)
      return
    }

    const rule = await res.json()
    setRules(prev => [{ ...rule, emaScore: 0.5, weakFlag: false }, ...prev])
    resetForm()
    setShowModal(false)
    setSaving(false)
  }

  async function handleDelete(ruleId: string) {
    await fetch(`/api/rules?id=${ruleId}`, { method: 'DELETE' })
    setRules(prev => prev.filter(r => r.id !== ruleId))
  }

  if (loading) return <p className="text-sm text-muted-foreground">Загружаем...</p>

  return (
    <>
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Обзор / Правила</p>
            <h1 className="text-xl font-semibold">Правила</h1>
          </div>
          <Button onClick={() => { resetForm(); setShowModal(true) }}>
            + Добавить
          </Button>
        </div>

        {rules.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-3xl mb-2">📖</p>
              <p className="text-sm font-medium">Нет правил</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Добавьте первое правило для генерации задач</p>
              <Button onClick={() => { resetForm(); setShowModal(true) }}>
                + Добавить правило
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
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800">слабое</Badge>
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
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Примеры</p>
                        {rule.examples.map((ex, i) => (
                          <p key={i} className="text-sm text-muted-foreground">— {ex}</p>
                        ))}
                      </div>
                    )}
                    {rule.aiContext && (
                      <div className="flex flex-col gap-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Контекст для ИИ</p>
                        <p className="text-xs text-muted-foreground">{rule.aiContext}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">
                        Сложность: {DIFFICULTY_LABELS[rule.difficulty]}
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(rule.id)}
                      >
                        Удалить
                      </Button>
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
            <DialogTitle>Добавить правило</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Type */}
            <div className="flex flex-col gap-1.5">
              <Label>Тип</Label>
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
              <Label htmlFor="rule-title">Название *</Label>
              <Input
                id="rule-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Present Perfect"
                required
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-desc">Описание</Label>
              <textarea
                id="rule-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Краткое описание правила..."
                rows={2}
                className={textareaClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-formula">Формула / структура</Label>
              <Input
                id="rule-formula"
                value={formula}
                onChange={e => setFormula(e.target.value)}
                placeholder="have/has + V3"
                className="font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-examples">
                Примеры <span className="normal-case font-normal text-muted-foreground">(каждый с новой строки)</span>
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
              <Label htmlFor="rule-context">Контекст для ИИ</Label>
              <textarea
                id="rule-context"
                value={aiContext}
                onChange={e => setAiContext(e.target.value)}
                placeholder="Дополнительные указания для генерации задач..."
                rows={2}
                className={textareaClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-diff">
                Сложность — {DIFFICULTY_LABELS[difficulty]}
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
                Отмена
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? 'Сохраняем...' : 'Сохранить'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}