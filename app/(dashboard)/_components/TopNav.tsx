'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Globe, Dumbbell, TrendingUp, History, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ThemeToggle from './ThemeToggle'

type Props = { userEmail: string }

const NAV = [
  { href: '/dashboard',  icon: LayoutDashboard, label: 'Home' },
  { href: '/languages',  icon: Globe,           label: 'Languages' },
  { href: '/practice',   icon: Dumbbell,        label: 'Practice' },
  { href: '/progress',   icon: TrendingUp,      label: 'Progress' },
  { href: '/history',    icon: History,         label: 'History' },
  { href: '/settings',   icon: Settings,        label: 'Settings' },
]

export default function TopNav({ userEmail }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  // Detect language context — only on /languages/[id]/<section>, not /languages index or /languages/new
  const langMatch    = pathname.match(/\/languages\/([^/]+)\//)
  const activeLangId = langMatch ? langMatch[1] : null

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="flex flex-col border-b bg-background shrink-0">

      {/* ── Main bar ── */}
      <div className="flex items-center h-14 px-4">

        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex items-center mr-3 text-base font-black tracking-tight select-none"
        >
          koto<span className="text-primary">ba</span>
        </Link>

        <div className="flex-1" />

        {/* Nav icons + divider + theme + logout */}
        <div className="flex items-center gap-1">
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
                  'flex items-center justify-center w-9 h-9 rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted',
                ].join(' ')}
              >
                <Icon className="size-[18px]" />
              </Link>
            )
          })}
          <div className="w-px h-5 bg-border mx-1.5" />
          <ThemeToggle />
          <button
            onClick={handleLogout}
            title={`Sign out (${userEmail})`}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>

      {/* ── Section tabs — only inside a language ── */}
      {activeLangId && (
        <div className="flex items-stretch px-4 border-t">
          {[
            { href: `/languages/${activeLangId}/rules`,      label: 'Rules' },
            { href: `/languages/${activeLangId}/vocabulary`, label: 'Vocabulary' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={[
                'px-3 py-2.5 text-sm font-semibold border-b-2 transition-colors',
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
  )
}