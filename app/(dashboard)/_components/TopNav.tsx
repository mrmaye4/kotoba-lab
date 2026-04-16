'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { LayoutDashboard, Dumbbell, TrendingUp, History, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ThemeToggle from './ThemeToggle'

type Language = { id: string; name: string; flagEmoji: string | null }
type Props = { languages: Language[]; userEmail: string }

const FLAG_OPTIONS = ['🇬🇧','🇺🇸','🇩🇪','🇫🇷','🇪🇸','🇮🇹','🇵🇱','🇺🇦','🇷🇺','🇨🇳','🇯🇵','🇰🇷','🇧🇷','🇵🇹','🇸🇪','🇳🇱']

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/practice',  icon: Dumbbell,        label: 'Practice' },
  { href: '/progress',  icon: TrendingUp,       label: 'Progress' },
  { href: '/history',   icon: History,          label: 'History' },
  { href: '/settings',  icon: Settings,         label: 'Settings' },
]

export default function TopNav({ languages: initialLanguages, userEmail }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  const [languages,     setLanguages]     = useState(initialLanguages)
  const [showAddModal,  setShowAddModal]  = useState(false)

  useEffect(() => {
    setLanguages(initialLanguages)
  }, [initialLanguages])
  const [newName,       setNewName]       = useState('')
  const [newFlag,       setNewFlag]       = useState('🇬🇧')
  const [adding,        setAdding]        = useState(false)
  const [addError,      setAddError]      = useState('')

  // Detect language context — only on /languages/[id]/<section> paths, not /languages/new
  const langMatch    = pathname.match(/\/languages\/([^/]+)\//)
  const activeLangId = langMatch ? langMatch[1] : null

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleAddLanguage(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    setAdding(true)

    const res = await fetch('/api/languages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, flagEmoji: newFlag }),
    })

    if (!res.ok) {
      setAddError('Failed to add language')
      setAdding(false)
      return
    }

    const lang = await res.json()
    setLanguages(prev => [...prev, lang])
    setNewName('')
    setNewFlag('🇬🇧')
    setShowAddModal(false)
    setAdding(false)
    router.push(`/languages/${lang.id}/rules`)
    router.refresh()
  }

  return (
    <>
      <header className="flex flex-col border-b bg-background shrink-0">

        {/* ── Main bar ── */}
        <div className="flex items-stretch h-11 px-4">

          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex items-center mr-5 text-sm font-black tracking-tight select-none"
          >
            koto<span className="text-primary">ba</span>
          </Link>

          {/* Language tabs */}
          <div className="flex items-stretch flex-1 overflow-x-auto">
            {languages.map(lang => (
              <Link
                key={lang.id}
                href={`/languages/${lang.id}/rules`}
                className={[
                  'flex items-center gap-1.5 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors',
                  activeLangId === lang.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {lang.flagEmoji && <span>{lang.flagEmoji}</span>}
                {lang.name}
              </Link>
            ))}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center px-3 border-b-2 border-transparent text-muted-foreground/40 hover:text-muted-foreground transition-colors text-base leading-none"
              title="Add language"
              aria-label="Add language"
            >
              +
            </button>
          </div>

          {/* Right: nav icons + divider + theme + logout */}
          <div className="flex items-center gap-0.5 ml-2">
            {NAV.map(({ href, icon: Icon, label }) => {
              const isActive = href === '/dashboard'
                ? pathname === href
                : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={[
                    'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted',
                  ].join(' ')}
                >
                  <Icon className="size-[15px]" />
                </Link>
              )
            })}
            <div className="w-px h-4 bg-border mx-1.5" />
            <ThemeToggle />
            <button
              onClick={handleLogout}
              title={`Sign out (${userEmail})`}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted transition-colors"
            >
              <LogOut className="size-[15px]" />
            </button>
          </div>
        </div>

        {/* ── Section tabs — only inside a language ── */}
        {activeLangId && (
          <div className="flex items-stretch px-4">
            {[
              { href: `/languages/${activeLangId}/rules`,      label: 'Rules' },
              { href: `/languages/${activeLangId}/vocabulary`, label: 'Vocabulary' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={[
                  'px-3 py-2 text-xs font-semibold border-b-2 transition-colors',
                  pathname.startsWith(href)
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Add Language Modal */}
      <Dialog
        open={showAddModal}
        onOpenChange={open => {
          setShowAddModal(open)
          if (!open) {
            setAddError('')
            setNewName('')
            setNewFlag('🇬🇧')
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add language</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddLanguage} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lang-name">Name</Label>
              <Input
                id="lang-name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="English"
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Flag</Label>
              <div className="flex flex-wrap gap-1.5">
                {FLAG_OPTIONS.map(flag => (
                  <button
                    key={flag}
                    type="button"
                    onClick={() => setNewFlag(flag)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-colors ${
                      newFlag === flag ? 'bg-primary' : 'bg-muted hover:bg-accent'
                    }`}
                  >
                    {flag}
                  </button>
                ))}
              </div>
            </div>
            {addError && (
              <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-xs">{addError}</p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={adding}>
                {adding ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}