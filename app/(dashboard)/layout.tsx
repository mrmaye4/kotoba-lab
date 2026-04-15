import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { languages } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import AppSidebar from './_components/Sidebar'
import ThemeToggle from './_components/ThemeToggle'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userLanguages = await db
    .select({ id: languages.id, name: languages.name, flagEmoji: languages.flagEmoji })
    .from(languages)
    .where(eq(languages.userId, user.id))

  return (
    <SidebarProvider>
      <AppSidebar languages={userLanguages} userEmail={user.email ?? ''} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <ThemeToggle />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}