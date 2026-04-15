import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { languages, rules, vocabulary, sessions, ruleStats } from '@/lib/db/schema'
import { eq, count, and, lt, lte } from 'drizzle-orm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [
    userLanguages,
    [{ total: totalRules }],
    [{ total: totalVocab }],
    [{ total: totalSessions }],
    [{ weakCount }],
    [{ dueCount }],
  ] = await Promise.all([
    db
      .select({ id: languages.id, name: languages.name, flagEmoji: languages.flagEmoji })
      .from(languages)
      .where(eq(languages.userId, user.id)),

    db
      .select({ total: count() })
      .from(rules)
      .where(eq(rules.userId, user.id)),

    db
      .select({ total: count() })
      .from(vocabulary)
      .where(eq(vocabulary.userId, user.id)),

    db
      .select({ total: count() })
      .from(sessions)
      .where(eq(sessions.userId, user.id)),

    db
      .select({ weakCount: count() })
      .from(ruleStats)
      .where(and(eq(ruleStats.userId, user.id), lt(ruleStats.emaScore, 0.6))),

    db
      .select({ dueCount: count() })
      .from(ruleStats)
      .where(and(eq(ruleStats.userId, user.id), lte(ruleStats.nextReview, new Date()))),
  ])

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your progress at a glance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: 'Languages', value: userLanguages.length },
          { label: 'Rules', value: totalRules },
          { label: 'Words', value: totalVocab },
          { label: 'Sessions', value: totalSessions },
        ].map(stat => (
          <Card key={stat.label} size="sm">
            <CardContent className="pt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{stat.label}</p>
              <p className="text-2xl font-semibold mt-1">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Due rules banner */}
      {dueCount > 0 && (
        <Card size="sm" className="mb-4 bg-primary/5 ring-primary/20 dark:bg-primary/10">
          <CardContent className="pt-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {dueCount} {dueCount === 1 ? 'rule' : 'rules'} due for review
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Ready to practice today</p>
            </div>
            <Button size="sm" nativeButton={false} render={<Link href="/practice?due=1" />}>
              Start →
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Weak rules alert */}
      {weakCount > 0 && (
        <Card size="sm" className="mb-6 bg-amber-100 ring-amber-200 dark:bg-amber-950/50 dark:ring-amber-800">
          <CardContent className="pt-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                {weakCount} {weakCount === 1 ? 'weak rule' : 'weak rules'}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">Consider practicing them separately</p>
            </div>
            <Button variant="outline" size="sm" className="border-amber-300 text-amber-800 hover:bg-amber-200 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950" nativeButton={false} render={<Link href="/progress" />}>
              View
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Languages */}
      {userLanguages.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-3xl mb-2">🌍</p>
            <p className="text-sm font-medium">No languages yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Add your first language to get started</p>
            <Button nativeButton={false} render={<Link href="/languages/new" />}>
              Add language
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Languages</p>
          {userLanguages.map(lang => (
            <Card key={lang.id} size="sm">
              <CardContent className="pt-3 flex items-center justify-between">
                <span className="text-sm font-medium">
                  {lang.flagEmoji && <span className="mr-2">{lang.flagEmoji}</span>}
                  {lang.name}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/languages/${lang.id}/rules`} />}>
                    Rules
                  </Button>
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/languages/${lang.id}/vocabulary`} />}>
                    Words
                  </Button>
                  <Button size="sm" nativeButton={false} render={<Link href="/practice" />}>
                    Practice
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}