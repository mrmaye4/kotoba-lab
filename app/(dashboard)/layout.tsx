import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TopNav from './_components/TopNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav userEmail={user.email ?? ''} />
      <main className="flex flex-1 flex-col items-center px-4 py-6">
        <div className="w-full max-w-2xl">
          {children}
        </div>
      </main>
    </div>
  )
}
