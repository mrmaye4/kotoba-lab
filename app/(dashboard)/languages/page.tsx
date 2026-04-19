'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import RulesPanel from './_components/RulesPanel'
import VocabularyPanel from './_components/VocabularyPanel'

type Language = { id: string; name: string; flagEmoji: string | null }
type Section = 'rules' | 'vocabulary'

export default function LanguagesPage() {
  const [languages, setLanguages] = useState<Language[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('rules')

  useEffect(() => {
    fetch('/api/languages')
      .then(r => r.json())
      .then((data: Language[]) => {
        setLanguages(data)
        if (data.length > 0) setSelectedId(data[0].id)
        setLoading(false)
      })
  }, [])

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>

  if (languages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-5xl mb-4">🌍</p>
        <p className="text-base font-semibold">No languages yet</p>
        <p className="text-sm text-muted-foreground mt-1 mb-6">Add your first language to get started</p>
        <Button nativeButton={false} render={<Link href="/languages/new" />}>
          Add language
        </Button>
      </div>
    )
  }

  return (
    <div>
      {/* Language tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b mb-0">
        {languages.map(lang => (
          <button
            key={lang.id}
            onClick={() => { setSelectedId(lang.id); setSection('rules') }}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0',
              selectedId === lang.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            ].join(' ')}
          >
            {lang.flagEmoji && <span>{lang.flagEmoji}</span>}
            {lang.name}
          </button>
        ))}
        <Link
          href="/languages/new"
          className="flex items-center px-3 py-1.5 rounded-lg text-sm text-muted-foreground border border-dashed border-border hover:border-foreground hover:text-foreground transition-colors shrink-0 ml-1"
        >
          + Add
        </Link>
      </div>

      {/* Section tabs */}
      {selectedId && (
        <>
          <div className="flex items-stretch border-b mb-6">
            {(['rules', 'vocabulary'] as Section[]).map(s => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={[
                  'px-3 py-2.5 text-sm font-semibold border-b-2 transition-colors capitalize',
                  section === s
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {s === 'rules' ? 'Rules' : 'Vocabulary'}
              </button>
            ))}
          </div>

          {section === 'rules' && (
            <RulesPanel key={selectedId} languageId={selectedId} />
          )}
          {section === 'vocabulary' && (
            <VocabularyPanel key={selectedId + '-vocab'} languageId={selectedId} />
          )}
        </>
      )}
    </div>
  )
}