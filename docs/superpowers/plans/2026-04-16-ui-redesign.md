# UI Redesign — Navigation & Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar with a top-bar navigation (logo · language tabs · section tabs · nav icons), update the colour scheme to indigo/violet, and center all page content.

**Architecture:** A new `TopNav` client component replaces `AppSidebar` entirely. The dashboard layout is simplified — no `SidebarProvider`, just `TopNav` + a centred `<main>`. Colour variables in `globals.css` shift from blue (hue 262) to indigo (hue 264) with no structural changes to shadcn components.

**Tech Stack:** Next.js App Router, Tailwind CSS v4 (OKLch variables in `globals.css`), shadcn/ui components (Button, Input, Label, Dialog), Lucide icons.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/globals.css` | Modify | Shift primary/ring/accent/sidebar vars to indigo hue 264 |
| `app/(dashboard)/_components/TopNav.tsx` | **Create** | Full top-bar nav: logo, language tabs, section tabs, icon nav, add-language modal, logout |
| `app/(dashboard)/_components/Sidebar.tsx` | Delete | Replaced by TopNav |
| `app/(dashboard)/layout.tsx` | Modify | Drop SidebarProvider/AppSidebar/SidebarInset; render TopNav + centred main |

---

### Task 1: Shift colour scheme to indigo in globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Update light-mode colour vars**

In `app/globals.css`, inside `:root { … }`, replace these lines:

```css
/* BEFORE */
--primary: oklch(0.5461 0.2152 262.8809);
--primary-foreground: oklch(1.0000 0 0);
--accent: oklch(0.9705 0.0142 254.6042);
--accent-foreground: oklch(0.4244 0.1809 265.6377);
--ring: oklch(0.6231 0.1880 259.8145);
--sidebar-primary: oklch(0.5461 0.2152 262.8809);
--sidebar-primary-foreground: oklch(1.0000 0 0);
--sidebar-ring: oklch(0.6231 0.1880 259.8145);
```

```css
/* AFTER */
--primary: oklch(0.5850 0.2350 264.1);
--primary-foreground: oklch(1.0000 0 0);
--accent: oklch(0.9500 0.0300 264.1);
--accent-foreground: oklch(0.5850 0.2350 264.1);
--ring: oklch(0.6400 0.2100 264.1);
--sidebar-primary: oklch(0.5850 0.2350 264.1);
--sidebar-primary-foreground: oklch(1.0000 0 0);
--sidebar-ring: oklch(0.6400 0.2100 264.1);
```

- [ ] **Step 2: Update dark-mode colour vars**

In `app/globals.css`, inside `.dark { … }`, replace:

```css
/* BEFORE */
--primary: oklch(0.6231 0.1880 259.8145);
--primary-foreground: oklch(1.0000 0 0);
--accent: oklch(0.5461 0.2152 262.8809);
--accent-foreground: oklch(1.0000 0 0);
--ring: oklch(0.6231 0.1880 259.8145);
--chart-1: oklch(0.6231 0.1880 259.8145);
--sidebar-primary: oklch(0.6231 0.1880 259.8145);
--sidebar-primary-foreground: oklch(1.0000 0 0);
--sidebar-ring: oklch(0.6231 0.1880 259.8145);
```

```css
/* AFTER */
--primary: oklch(0.6400 0.2100 264.1);
--primary-foreground: oklch(1.0000 0 0);
--accent: oklch(0.5850 0.2350 264.1);
--accent-foreground: oklch(1.0000 0 0);
--ring: oklch(0.6700 0.1900 264.1);
--chart-1: oklch(0.6400 0.2100 264.1);
--sidebar-primary: oklch(0.6400 0.2100 264.1);
--sidebar-primary-foreground: oklch(1.0000 0 0);
--sidebar-ring: oklch(0.6700 0.1900 264.1);
```

- [ ] **Step 3: Verify type-check passes**

```bash
cd /Users/sinedviper/Documents/Projects/kotoba-lab && npx tsc --noEmit
```

Expected: no errors (CSS changes don't affect TypeScript).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat: shift colour scheme to indigo palette"
```

---

### Task 2: Create TopNav component

**Files:**
- Create: `app/(dashboard)/_components/TopNav.tsx`

- [ ] **Step 1: Create the file with full implementation**

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
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
  const [newName,       setNewName]       = useState('')
  const [newFlag,       setNewFlag]       = useState('🇬🇧')
  const [adding,        setAdding]        = useState(false)
  const [addError,      setAddError]      = useState('')

  // Detect language context — only on /languages/[id]/<section> paths, not /languages/new
  const langMatch  = pathname.match(/\/languages\/([^/]+)\//)
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
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
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
```

- [ ] **Step 2: Verify type-check passes**

```bash
cd /Users/sinedviper/Documents/Projects/kotoba-lab && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/_components/TopNav.tsx
git commit -m "feat: add TopNav component with language tabs and icon nav"
```

---

### Task 3: Update layout to use TopNav, remove sidebar

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Delete: `app/(dashboard)/_components/Sidebar.tsx`

- [ ] **Step 1: Replace layout.tsx**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { languages } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import TopNav from './_components/TopNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userLanguages = await db
    .select({ id: languages.id, name: languages.name, flagEmoji: languages.flagEmoji })
    .from(languages)
    .where(eq(languages.userId, user.id))

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav languages={userLanguages} userEmail={user.email ?? ''} />
      <main className="flex flex-1 flex-col items-center px-4 py-6">
        <div className="w-full max-w-2xl">
          {children}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Delete Sidebar.tsx**

```bash
rm /Users/sinedviper/Documents/Projects/kotoba-lab/app/(dashboard)/_components/Sidebar.tsx
```

- [ ] **Step 3: Verify type-check passes**

```bash
cd /Users/sinedviper/Documents/Projects/kotoba-lab && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Start dev server and verify visually**

```bash
cd /Users/sinedviper/Documents/Projects/kotoba-lab && npm run dev
```

Open http://localhost:3000. Check:
- Top bar visible with logo, nav icons, theme toggle
- Language tabs appear after adding/having a language
- Navigating to `/languages/[id]/rules` shows Rules / Vocabulary section tabs
- No sidebar anywhere
- Content is centred on all pages

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/layout.tsx
git rm app/(dashboard)/_components/Sidebar.tsx
git commit -m "feat: replace sidebar with top-bar navigation"
```