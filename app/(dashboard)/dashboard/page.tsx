import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { languages, rules, vocabulary, sessions, ruleStats } from '@/lib/db/schema'
import { eq, count, and, lt } from 'drizzle-orm'
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
  ])

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Обзор</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Общая картина вашего прогресса</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: 'Языков', value: userLanguages.length },
          { label: 'Правил', value: totalRules },
          { label: 'Слов', value: totalVocab },
          { label: 'Сессий', value: totalSessions },
        ].map(stat => (
          <Card key={stat.label} size="sm">
            <CardContent className="pt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{stat.label}</p>
              <p className="text-2xl font-semibold mt-1">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Weak rules alert */}
      {weakCount > 0 && (
        <Card size="sm" className="mb-6 bg-amber-50 ring-amber-200">
          <CardContent className="pt-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-800">
                {weakCount} {weakCount === 1 ? 'слабое правило' : 'слабых правила'}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">Стоит потренировать их отдельно</p>
            </div>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/progress" />}>
              Смотреть
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Languages */}
      {userLanguages.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-3xl mb-2">🌍</p>
            <p className="text-sm font-medium">Нет языков</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Добавьте первый язык чтобы начать</p>
            <Button nativeButton={false} render={<Link href="/languages/new" />}>
              Добавить язык
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Языки</p>
          {userLanguages.map(lang => (
            <Card key={lang.id} size="sm">
              <CardContent className="pt-3 flex items-center justify-between">
                <span className="text-sm font-medium">
                  {lang.flagEmoji && <span className="mr-2">{lang.flagEmoji}</span>}
                  {lang.name}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/languages/${lang.id}/rules`} />}>
                    Правила
                  </Button>
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/languages/${lang.id}/vocabulary`} />}>
                    Слова
                  </Button>
                  <Button size="sm" nativeButton={false} render={<Link href="/practice" />}>
                    Практика
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