import { db } from '@/lib/db'
import { userSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function getInterfaceLanguage(userId: string): Promise<string> {
  try {
    const [settings] = await db
      .select({ interfaceLanguage: userSettings.interfaceLanguage })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1)
    return settings?.interfaceLanguage ?? 'en'
  } catch {
    return 'en'
  }
}