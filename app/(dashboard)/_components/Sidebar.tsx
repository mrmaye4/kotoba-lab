'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, ChevronRight, LayoutDashboard, BookOpen, Dumbbell, TrendingUp, History, Plus, LogOut, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Language = {
  id: string
  name: string
  flagEmoji: string | null
}

type Props = {
  languages: Language[]
  userEmail: string
}

const FLAG_OPTIONS = ['🇬🇧', '🇺🇸', '🇩🇪', '🇫🇷', '🇪🇸', '🇮🇹', '🇵🇱', '🇺🇦', '🇷🇺', '🇨🇳', '🇯🇵', '🇰🇷', '🇧🇷', '🇵🇹', '🇸🇪', '🇳🇱']

export default function AppSidebar({ languages: initialLanguages, userEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const [languages, setLanguages] = useState(initialLanguages)
  const [expandedLang, setExpandedLang] = useState<string | null>(() => {
    const match = pathname.match(/\/languages\/([^/]+)/)
    return match ? match[1] : null
  })

  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newFlag, setNewFlag] = useState('🇬🇧')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

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
      <Sidebar>
        <SidebarHeader className="px-3 py-3">
          <span className="text-sm font-semibold tracking-tight px-2">LangLearn</span>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
                  { href: '/progress', label: 'Progress', icon: TrendingUp },
                  { href: '/history', label: 'History', icon: History },
                  { href: '/practice', label: 'Practice', icon: Dumbbell },
                  { href: '/settings', label: 'Settings', icon: Settings },
                ].map(({ href, label, icon: Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      render={<Link href={href} />}
                      isActive={href === '/dashboard' ? pathname === href : pathname.startsWith(href)}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Languages</SidebarGroupLabel>
            <SidebarGroupAction onClick={() => setShowAddModal(true)} title="Add language">
              <Plus />
            </SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                {languages.length === 0 && (
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setShowAddModal(true)}>
                      <Plus />
                      <span>Add language</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {languages.map(lang => {
                  const isExpanded = expandedLang === lang.id
                  const langBase = `/languages/${lang.id}`

                  return (
                    <SidebarMenuItem key={lang.id}>
                      <SidebarMenuButton
                        onClick={() => setExpandedLang(isExpanded ? null : lang.id)}
                        isActive={pathname.startsWith(langBase)}
                      >
                        <BookOpen />
                        <span>
                          {lang.flagEmoji && <span className="mr-1">{lang.flagEmoji}</span>}
                          {lang.name}
                        </span>
                        {isExpanded
                          ? <ChevronDown className="ml-auto size-3" />
                          : <ChevronRight className="ml-auto size-3" />}
                      </SidebarMenuButton>

                      {isExpanded && (
                        <SidebarMenuSub>
                          {[
                            { href: `${langBase}/rules`, label: 'Rules' },
                            { href: `${langBase}/vocabulary`, label: 'Vocabulary' },
                          ].map(sub => (
                            <SidebarMenuSubItem key={sub.href}>
                              <SidebarMenuSubButton
                                render={<Link href={sub.href} />}
                                isActive={pathname.startsWith(sub.href)}
                              >
                                <span>{sub.label}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="px-2 py-1 text-xs text-sidebar-foreground/50 truncate">{userEmail}</div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout}>
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

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