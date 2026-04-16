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
