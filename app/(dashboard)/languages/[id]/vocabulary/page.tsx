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

type Category = { id: string; name: string }

type Word = {
  id: string
  word: string
  translation: string
  context: string | null
  categoryId: string | null
  interval: number
  repetitions: number
  nextReview: string
}

const textareaClass = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none font-mono placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none transition-colors"

export default function VocabularyPage() {
  const { id: languageId } = useParams<{ id: string }>()

  const [words, setWords] = useState<Word[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dueCount, setDueCount] = useState(0)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null) // null = All

  // Add word
  const [showAddModal, setShowAddModal] = useState(false)
  const [newWord, setNewWord] = useState('')
  const [newTranslation, setNewTranslation] = useState('')
  const [newContext, setNewContext] = useState('')
  const [newCategoryId, setNewCategoryId] = useState<string>('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const [translating, setTranslating] = useState(false)

  // Edit word
  const [editWord, setEditWord] = useState<Word | null>(null)
  const [editWordVal, setEditWordVal] = useState('')
  const [editTranslation, setEditTranslation] = useState('')
  const [editContext, setEditContext] = useState('')
  const [editCategoryId, setEditCategoryId] = useState<string>('')
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  // Import
  const [showImportModal, setShowImportModal] = useState(false)
  const [importContent, setImportContent] = useState('')
  const [importFormat, setImportFormat] = useState<'auto' | 'csv' | 'tsv'>('auto')
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [apkgFile, setApkgFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const apkgRef = useRef<HTMLInputElement>(null)

  // Add category
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)

  // Embeddings sync
  const [missingEmbeddings, setMissingEmbeddings] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/vocabulary?languageId=${languageId}`).then(r => r.json()),
      fetch(`/api/vocabulary/categories?languageId=${languageId}`).then(r => r.json()),
      fetch(`/api/vocabulary/embed?languageId=${languageId}`).then(r => r.json()).catch(() => ({ missing: 0 })),
    ]).then(([wordsData, catsData, embedData]: [Word[], Category[], { missing: number }]) => {
      setWords(wordsData)
      setCategories(catsData)
      setMissingEmbeddings(embedData.missing ?? 0)
      const now = new Date()
      setDueCount(wordsData.filter(w => new Date(w.nextReview) <= now).length)
      setLoading(false)
    })
  }, [languageId])

  async function handleSyncEmbeddings() {
    setSyncing(true)
    const res = await fetch(`/api/vocabulary/embed?languageId=${languageId}`, { method: 'POST' })
    if (res.ok) setMissingEmbeddings(0)
    setSyncing(false)
  }

  const filteredWords = activeCategoryId === 'none'
    ? words.filter(w => !w.categoryId)
    : activeCategoryId
    ? words.filter(w => w.categoryId === activeCategoryId)
    : words

  const reviewUrl = activeCategoryId
    ? `/languages/${languageId}/vocabulary/review?categoryId=${activeCategoryId}`
    : `/languages/${languageId}/vocabulary/review`

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    setAdding(true)
    const res = await fetch('/api/vocabulary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        languageId, word: newWord, translation: newTranslation,
        context: newContext, categoryId: newCategoryId || null,
      }),
    })
    if (!res.ok) { setAddError('Failed to add word'); setAdding(false); return }
    const entry = await res.json()
    setWords(prev => [entry, ...prev])
    setNewWord(''); setNewTranslation(''); setNewContext(''); setNewCategoryId('')
    setShowAddModal(false)
    setAdding(false)
  }

  async function handleTranslate() {
    if (!newWord.trim()) return
    setTranslating(true)
    const res = await fetch('/api/vocabulary/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: newWord, languageId }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.translation) setNewTranslation(data.translation)
      if (data.example) setNewContext(data.example)
    }
    setTranslating(false)
  }

  function openEdit(w: Word) {
    setEditWord(w)
    setEditWordVal(w.word)
    setEditTranslation(w.translation)
    setEditContext(w.context ?? '')
    setEditCategoryId(w.categoryId ?? '')
    setEditError('')
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editWord) return
    setEditError('')
    setSaving(true)
    const res = await fetch('/api/vocabulary', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editWord.id, word: editWordVal, translation: editTranslation,
        context: editContext, categoryId: editCategoryId || null,
      }),
    })
    if (!res.ok) { setEditError('Failed to save'); setSaving(false); return }
    const updated = await res.json()
    setWords(prev => prev.map(w => w.id === updated.id ? updated : w))
    setEditWord(null)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/vocabulary?id=${id}`, { method: 'DELETE' })
    setWords(prev => prev.filter(w => w.id !== id))
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!newCatName.trim()) return
    setAddingCat(true)
    const res = await fetch('/api/vocabulary/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languageId, name: newCatName }),
    })
    if (res.ok) {
      const cat = await res.json()
      setCategories(prev => [...prev, cat])
      setNewCatName('')
      setShowCatModal(false)
    }
    setAddingCat(false)
  }

  async function handleDeleteCategory(id: string) {
    await fetch(`/api/vocabulary/categories?id=${id}`, { method: 'DELETE' })
    setCategories(prev => prev.filter(c => c.id !== id))
    if (activeCategoryId === id) setActiveCategoryId(null)
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

  async function handleApkgImport(e: React.FormEvent) {
    e.preventDefault()
    if (!apkgFile) return
    setImportError('')
    setImportResult(null)
    setImporting(true)
    const form = new FormData()
    form.append('languageId', languageId)
    form.append('file', apkgFile)
    const res = await fetch('/api/vocabulary/import-apkg', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setImportError(data.error || 'Import error'); setImporting(false); return }
    setImportResult(data)
    setImporting(false)
    setApkgFile(null)
    const updated = await fetch(`/api/vocabulary?languageId=${languageId}`).then(r => r.json())
    setWords(updated)
    const now = new Date()
    setDueCount(updated.filter((w: Word) => new Date(w.nextReview) <= now).length)
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
    if (!res.ok) { setImportError(data.error || 'Import error'); setImporting(false); return }
    setImportResult(data)
    setImporting(false)
    const updated = await fetch(`/api/vocabulary?languageId=${languageId}`).then(r => r.json())
    setWords(updated)
    const now = new Date()
    setDueCount(updated.filter((w: Word) => new Date(w.nextReview) <= now).length)
  }

  function formatNextReview(dateStr: string) {
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (diff <= 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    return `In ${diff}d`
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>

  return (
    <>
      <div className="max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Overview / Words</p>
            <h1 className="text-xl font-semibold">Vocabulary</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setImportResult(null); setImportError(''); setImportContent(''); setShowImportModal(true) }}>
              Import
            </Button>
            <Button onClick={() => { setAddError(''); setNewWord(''); setNewTranslation(''); setNewContext(''); setNewCategoryId(''); setShowAddModal(true) }}>
              + Add
            </Button>
          </div>
        </div>

        {/* Categories tabs */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategoryId(null)}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeCategoryId === null ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            All ({words.length})
          </button>
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-0.5 group">
              <button
                onClick={() => setActiveCategoryId(cat.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeCategoryId === cat.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat.name} ({words.filter(w => w.categoryId === cat.id).length})
              </button>
              <button
                onClick={() => handleDeleteCategory(cat.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive text-xs px-1 transition-all"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => setShowCatModal(true)}
            className="px-3 py-1 rounded-lg text-xs text-muted-foreground border border-dashed border-border hover:border-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            + Category
          </button>
          {words.filter(w => !w.categoryId).length > 0 && (
            <button
              onClick={() => setActiveCategoryId('none')}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategoryId === 'none' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Uncategorized ({words.filter(w => !w.categoryId).length})
            </button>
          )}
        </div>

        {/* Due banner */}
        {dueCount > 0 && (
          <Card size="sm" className="mb-4 bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-800">
            <CardContent className="pt-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-400">
                  {dueCount} {dueCount === 1 ? 'word' : 'words'} due for review
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">Accumulated since last time</p>
              </div>
              <Button variant="outline" size="sm" nativeButton={false} className="border-emerald-300 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/50" render={<Link href={reviewUrl} />}>
                Review →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Embeddings sync banner */}
        {missingEmbeddings > 0 && (
          <Card size="sm" className="mb-4 bg-blue-50 ring-blue-200 dark:bg-blue-950/30 dark:ring-blue-800">
            <CardContent className="pt-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-400">
                  {missingEmbeddings} {missingEmbeddings === 1 ? 'word' : 'words'} without AI index
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">Sync to enable semantic vocabulary search in practice</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-800 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/50"
                onClick={handleSyncEmbeddings}
                disabled={syncing}
              >
                {syncing ? 'Syncing...' : 'Sync'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Word list */}
        {filteredWords.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-3xl mb-2">📝</p>
              <p className="text-sm font-medium">No words yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Add words manually or import from Quizlet / Anki</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setShowImportModal(true)}>Import</Button>
                <Button onClick={() => setShowAddModal(true)}>+ Add</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{filteredWords.length} words</p>
              <Link href={reviewUrl} className="text-xs font-medium hover:underline">
                Review all →
              </Link>
            </div>
            <div className="flex flex-col gap-1.5">
              {filteredWords.map(w => (
                <Card key={w.id} size="sm">
                  <CardContent className="pt-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{w.word}</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-sm text-muted-foreground">{w.translation}</span>
                        {w.categoryId && (
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {categories.find(c => c.id === w.categoryId)?.name}
                          </span>
                        )}
                      </div>
                      {w.context && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">"{w.context}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs ${new Date(w.nextReview) <= new Date() ? 'text-amber-500 font-medium' : 'text-muted-foreground'}`}>
                        {formatNextReview(w.nextReview)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(w)}
                      >
                        ✎
                      </Button>
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
      <Dialog open={showAddModal} onOpenChange={open => { setShowAddModal(open); if (!open) setAddError('') }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add word</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="word">Word *</Label>
              <div className="flex gap-2">
                <Input
                  id="word"
                  value={newWord}
                  onChange={e => setNewWord(e.target.value)}
                  placeholder="make"
                  required
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTranslate}
                  disabled={translating || !newWord.trim()}
                  title="Auto-fill translation and example"
                >
                  {translating ? '...' : '✨'}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="translation">Translation *</Label>
              <Input
                id="translation"
                value={newTranslation}
                onChange={e => setNewTranslation(e.target.value)}
                placeholder="to do"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="context">Example</Label>
              <Input
                id="context"
                value={newContext}
                onChange={e => setNewContext(e.target.value)}
                placeholder="Make a decision"
              />
            </div>
            {categories.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNewCategoryId('')}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${!newCategoryId ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
                  >
                    None
                  </button>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewCategoryId(c.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${newCategoryId === c.id ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {addError && <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-xs">{addError}</p>}
            <div className="flex gap-2 mt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={adding}>{adding ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit word dialog */}
      <Dialog open={!!editWord} onOpenChange={open => { if (!open) setEditWord(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit word</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Word *</Label>
              <Input value={editWordVal} onChange={e => setEditWordVal(e.target.value)} required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Translation *</Label>
              <Input value={editTranslation} onChange={e => setEditTranslation(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Example</Label>
              <Input value={editContext} onChange={e => setEditContext(e.target.value)} />
            </div>
            {categories.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditCategoryId('')}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${!editCategoryId ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
                  >
                    None
                  </button>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setEditCategoryId(c.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${editCategoryId === c.id ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {editError && <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-xs">{editError}</p>}
            <div className="flex gap-2 mt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditWord(null)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add category dialog */}
      <Dialog open={showCatModal} onOpenChange={open => { setShowCatModal(open); if (!open) setNewCatName('') }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCategory} className="flex flex-col gap-3">
            <Input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="e.g. Verbs, Travel, Business..."
              required
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCatModal(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={addingCat}>{addingCat ? 'Adding...' : 'Add'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={showImportModal} onOpenChange={open => { setShowImportModal(open); if (!open) { setImportResult(null); setApkgFile(null) } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Import words</DialogTitle>
          </DialogHeader>
          {importResult ? (
            <div className="text-center py-4">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm font-medium">Imported: {importResult.imported}</p>
              {importResult.skipped > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Skipped duplicates: {importResult.skipped}</p>
              )}
              <Button className="mt-4" onClick={() => setShowImportModal(false)}>Done</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Anki .apkg section */}
              <div className="rounded-lg border border-border p-3 flex flex-col gap-2">
                <div>
                  <p className="text-xs font-medium">Anki package (.apkg)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Переносит карточки вместе с историей повторений</p>
                </div>
                <form onSubmit={handleApkgImport} className="flex flex-col gap-2">
                  <input
                    ref={apkgRef}
                    type="file"
                    accept=".apkg"
                    onChange={e => setApkgFile(e.target.files?.[0] ?? null)}
                    className="text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border file:border-border file:text-xs file:bg-muted file:text-foreground hover:file:bg-accent cursor-pointer"
                  />
                  {apkgFile && (
                    <Button type="submit" size="sm" disabled={importing}>
                      {importing ? 'Importing...' : `Import ${apkgFile.name}`}
                    </Button>
                  )}
                </form>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* CSV / TSV / plain text section */}
              <form onSubmit={handleImport} className="flex flex-col gap-3">
                <p className="text-xs font-medium -mb-1">CSV / TSV / Anki plain text (.txt)</p>
                <div className="flex flex-col gap-1.5">
                  <Label>File</Label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileChange}
                    className="text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border file:border-border file:text-xs file:bg-muted file:text-foreground hover:file:bg-accent cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Format</Label>
                  <div className="flex gap-2">
                    {(['auto', 'csv', 'tsv'] as const).map(f => (
                      <Button key={f} type="button" variant={importFormat === f ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setImportFormat(f)}>
                        {f === 'auto' ? 'Auto' : f.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Or paste text</Label>
                  <textarea
                    value={importContent}
                    onChange={e => setImportContent(e.target.value)}
                    placeholder={"word,translation,example\nmake,to do,Make a decision"}
                    rows={4}
                    className={textareaClass}
                  />
                </div>
                {importError && <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-xs">{importError}</p>}
                <div className="flex gap-2 mt-1">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowImportModal(false)}>Cancel</Button>
                  <Button type="submit" className="flex-1" disabled={importing || !importContent}>{importing ? 'Importing...' : 'Import'}</Button>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}