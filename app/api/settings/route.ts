import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { userSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const DEFAULT_SETTINGS = { interfaceLanguage: 'en' }

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))
      .limit(1)
    return NextResponse.json(settings ?? { userId: user.id, ...DEFAULT_SETTINGS })
  } catch {
    // Table not yet migrated — return defaults
    return NextResponse.json({ userId: user.id, ...DEFAULT_SETTINGS })
  }
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { interfaceLanguage } = await request.json()
  if (!interfaceLanguage) return NextResponse.json({ error: 'interfaceLanguage required' }, { status: 400 })

  try {
    const [updated] = await db
      .insert(userSettings)
      .values({ userId: user.id, interfaceLanguage, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { interfaceLanguage, updatedAt: new Date() },
      })
      .returning()
    return NextResponse.json(updated)
  } catch {
    // Table not yet migrated — return the value as-is
    return NextResponse.json({ userId: user.id, interfaceLanguage })
  }
}