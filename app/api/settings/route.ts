import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { userSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const DEFAULT_DAILY = {
  maxRules: 10,
  mode: 'practice',
  taskCount: 10,
  difficulty: 'any',
  includeVocab: false,
}

const DEFAULT_SETTINGS = {
  interfaceLanguage: 'en',
  dailyPractice: DEFAULT_DAILY,
}

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
    if (!settings) return NextResponse.json({ userId: user.id, ...DEFAULT_SETTINGS })
    return NextResponse.json({
      ...settings,
      dailyPractice: { ...DEFAULT_DAILY, ...(settings.dailyPractice ?? {}) },
    })
  } catch {
    return NextResponse.json({ userId: user.id, ...DEFAULT_SETTINGS })
  }
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { interfaceLanguage, dailyPractice } = body

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (interfaceLanguage) updateData.interfaceLanguage = interfaceLanguage
  if (dailyPractice) updateData.dailyPractice = { ...DEFAULT_DAILY, ...dailyPractice }

  if (Object.keys(updateData).length === 1) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  try {
    const [updated] = await db
      .insert(userSettings)
      .values({
        userId: user.id,
        interfaceLanguage: interfaceLanguage ?? 'en',
        dailyPractice: dailyPractice ? { ...DEFAULT_DAILY, ...dailyPractice } : DEFAULT_DAILY,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: updateData,
      })
      .returning()
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ userId: user.id, ...DEFAULT_SETTINGS })
  }
}