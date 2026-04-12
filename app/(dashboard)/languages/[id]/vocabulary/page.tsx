'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

type Word = {
  id: string
  word: string
  translation: string
  context: string | null
  interval: number
  repetitions: number
  nextReview: string
}

const textareaClass = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none font-mono placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none transition-colors"

export default function VocabularyPage() {
  const { id: languageId } = useParams<{ id: string }>()

  const [words, setWords] = useState<Word[]>([])
  const [loading, setLoading] = useState(true)
  const [dueCount, setDueCount] = useState(0)

  const [showAddModal, setShowAddModal] = useState(false)
  const [newWord, setNewWord] = useState('')
  const [newTranslation, setNewTranslation] = useState('')
  const [newContext, setNewContext] = useState('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  const [showImportModal, setShowImportModal] = useState(false)
  const [importContent, setImportContent] = useState('')
  const [importFormat, setImportFormat] = useState<'auto' | 'csv' | 'tsv'>('auto')
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/vocabulary?languageId=${languageId}`)
      .then(r => r.json())
      .then((data: Word[]) => {
        setWords(data)
        const now = new Date()
        setDueCount(data.filter(w => new Date(w.nextReview) <= now).length)
        setLoading(false)
      })
  }, [languageId])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    setAdding(true)

    const res = await fetch('/api/vocabulary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languageId, word: newWord, translation: newTranslation, context: newContext }),
    })

    if (!res.ok) {
      setAddError('Не удалось до��авить слово')
      setAdding(false)
      return
    }

    const entry = await res.json()
    setWords(prev => [entry, ...prev])
    setNewWord(''); setNewTranslation(''); setNewContext('')
    setShowAddModal(false)
    setAdding(false)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/vocabulary?id=${id}`, { method: 'DELETE' })
    setWords(prev => prev.filter(w => w.id !== id))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'tsv') setImportFormat('tsv')
    else if (ext === 'csv') setImportFormat('csv')
    else setImportFormat('auto')
    const reader = new FileReader()
    reader.onload = ev => setImportContent(ev.target?.result as string)
    reader.readAsText(file)
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    setImportError('')
    setImportResult(null)
    setImporting(true)

    const res = await fetch('/api/vocabulary/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languageId, format: importFormat, content: importContent }),
    })

    const data = await res.json()

    if (!res.ok) {
      setImportError(data.error || 'Ошибка импорта')
      setImporting(false)
      return
    }

    setImportResult(data)
    setImporting(false)

    const updated = await fetch(`/api/vocabulary?languageId=${languageId}`).then(r => r.json())
    setWords(updated)
    const now = new Date()
    setDueCount(updated.filter((w: Word) => new Date(w.nextReview) <= now).length)
  }

  function formatNextReview(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diff <= 0) return 'Сегодня'
    if (diff === 1) return 'Завтра'
    return `Через ${diff} д.`
  }

  if (loading) return <p className="text-sm text-muted-foreground">Загружаем...</p>

  return (
    <>
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Обзор / Слова</p>
            <h1 className="text-xl font-semibold">Словарь</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => { setImportResult(null); setImportError(''); setImportContent(''); setShowImportModal(true) }}
            >
              Импорт
            </Button>
            <Button onClick={() => { setAddError(''); setShowAddModal(true) }}>
              + Добавить
            </Button>
          </div>
        </div>

        {/* Due banner */}
        {dueCount > 0 && (
          <Card size="sm" className="mb-5 bg-emerald-50 ring-emerald-200">
            <CardContent className="pt-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-800">
                  {dueCount} {dueCount === 1 ? 'слово' : 'слов'} на повторение
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">Накопилось с прошлого раза</p>
              </div>
              <Button variant="outline" size="sm" nativeButton={false} className="border-emerald-300 text-emerald-800 hover:bg-emerald-100" render={<Link href={`/languages/${languageId}/vocabulary/review`} />}>
                Повторять →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {words.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-3xl mb-2">📝</p>
              <p className="text-sm font-medium">Нет слов</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Добавьте слова вручную или импортируйте из Quizlet / Anki</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setShowImportModal(true)}>Импорт</Button>
                <Button onClick={() => setShowAddModal(true)}>+ Добавить</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{words.length} слов</p>
              <Link href={`/languages/${languageId}/vocabulary/review`} className="text-xs font-medium hover:underline">
                Повторять все →
              </Link>
            </div>
            <div className="flex flex-col gap-1.5">
              {words.map(w => (
                <Card key={w.id} size="sm">
                  <CardContent className="pt-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{w.word}</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-sm text-muted-foreground">{w.translation}</span>
                      </div>
                      {w.context && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{w.context}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs ${new Date(w.nextReview) <= new Date() ? 'text-amber-500 font-medium' : 'text-muted-foreground'}`}>
                        {formatNextReview(w.nextReview)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(w.id)}
                      >
                        ✕
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add word dialog */}
      <Dialog open={showAddModal} onOpenChange={open => { setShowAddModal(open); if (!open) { setAddError('') } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Добавить слово</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="word">Слово *</Label>
              <Input
                id="word"
                value={newWord}
                onChange={e => setNewWord(e.target.value)}
                placeholder="make"
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="translation">Перевод *</Label>
              <Input
                id="translation"
                value={newTranslation}
                onChange={e => setNewTranslation(e.target.value)}
                placeholder="делать"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="context">Пример</Label>
              <Input
                id="context"
                value={newContext}
                onChange={e => setNewContext(e.target.value)}
                placeholder="Make a decision"
              />
            </div>
            {addError && (
              <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-xs">{addError}</p>
            )}
            <div className="flex gap-2 mt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>
                Отмена
              </Button>
              <Button type="submit" className="flex-1" disabled={adding}>
                {adding ? 'Сохраняем...' : 'Сохранить'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={showImportModal} onOpenChange={open => { setShowImportModal(open); if (!open) setImportResult(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Импорт слов</DialogTitle>
            <DialogDescription>CSV из Quizlet или TSV из Anki</DialogDescription>
          </DialogHeader>

          {importResult ? (
            <div className="text-center py-4">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm font-medium">Импортировано: {importResult.imported}</p>
              {importResult.skipped > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Пропущено ��убликатов: {importResult.skipped}</p>
              )}
              <Button className="mt-4" onClick={() => setShowImportModal(false)}>Готово</Button>
            </div>
          ) : (
            <form onSubmit={handleImport} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Файл</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileChange}
                  className="text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border file:border-border file:text-xs file:bg-muted file:text-foreground hover:file:bg-accent cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Формат</Label>
                <div className="flex gap-2">
                  {(['auto', 'csv', 'tsv'] as const).map(f => (
                    <Button
                      key={f}
                      type="button"
                      variant={importFormat === f ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setImportFormat(f)}
                    >
                      {f === 'auto' ? 'Авто' : f.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Или вставьте текст</Label>
                <textarea
                  value={importContent}
                  onChange={e => setImportContent(e.target.value)}
                  placeholder={"word,translation,example\nmake,делать,Make a decision"}
                  rows={4}
                  className={textareaClass}
                />
              </div>

              {importError && (
                <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-xs">{importError}</p>
              )}

              <div className="flex gap-2 mt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowImportModal(false)}>
                  Отмена
                </Button>
                <Button type="submit" className="flex-1" disabled={importing || !importContent}>
                  {importing ? 'Импортируем...' : 'Импорт'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}