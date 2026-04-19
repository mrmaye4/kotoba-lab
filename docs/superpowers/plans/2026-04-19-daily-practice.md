# Daily Practice Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-language "Minimum interval" setting with a daily practice system — a button per language on the dashboard that auto-selects weak rules and records completion.

**Architecture:** New `daily_practice_log` table stores one row per completed daily session per language per day. Dashboard queries this table and weak-rule counts to render per-language buttons. Session completion endpoint writes the log row when `session.mode = 'daily'`. Practice page gains a `?daily=1&lang=<id>` mode that skips config and auto-starts.

**Tech Stack:** Next.js App Router, Drizzle ORM, PostgreSQL (Supabase), TypeScript

---

### Task 1: Remove `minRuleInterval` from schema and add `daily_practice_log`

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Remove `minRuleInterval` from the `languages` table definition**

In `lib/db/schema.ts`, delete this line from the `languages` table:
```ts
  minRuleInterval: integer('min_rule_interval').notNull().default(1),
```

- [ ] **Step 2: Add `daily_practice_log` table at the end of `lib/db/schema.ts`**

```ts
export const dailyPracticeLog = pgTable('daily_practice_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  languageId: uuid('language_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  date: text('date').notNull(), // ISO date string: "2026-04-19"
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 3: Generate and push migration**

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

Expected: no errors, new migration file created, `daily_practice_log` table appears in Supabase.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: add daily_practice_log table, remove minRuleInterval from schema"
```

---

### Task 2: Clean up `minRuleInterval` from API routes

**Files:**
- Modify: `app/api/check/route.ts`
- Modify: `app/api/batch-evaluate/route.ts`
- Modify: `app/api/generate/route.ts`
- Modify: `app/api/languages/route.ts`

- [ ] **Step 1: Fix `app/api/check/route.ts`**

Remove the language query and `minInterval` logic. Replace these lines:
```ts
      const [lang] = await db
        .select({ minRuleInterval: languages.minRuleInterval })
        .from(languages)
        .where(eq(languages.id, session!.languageId))
        .limit(1)
      const minInterval = lang?.minRuleInterval ?? 1

      const sm2 = calculateNextReview(...)
      // Apply minimum interval floor
      const finalInterval = Math.max(minInterval, sm2.interval)
```
With:
```ts
      const sm2 = calculateNextReview(
        { easeFactor: stats.easeFactor, interval: stats.interval, repetitions: stats.repetitions },
        q
      )
      const finalInterval = sm2.interval
```
Also remove the `languages` import from this file if it's no longer used elsewhere in it.

- [ ] **Step 2: Fix `app/api/batch-evaluate/route.ts`**

Remove the `minRuleInterval` fetch from the language query. Change:
```ts
  const [lang] = await db
    .select({ name: languages.name, minRuleInterval: languages.minRuleInterval })
    .from(languages)
    .where(eq(languages.id, session.languageId))
    .limit(1)
  const languageName = lang?.name ?? 'Unknown'
  const minInterval = lang?.minRuleInterval ?? 1
```
To:
```ts
  const [lang] = await db
    .select({ name: languages.name })
    .from(languages)
    .where(eq(languages.id, session.languageId))
    .limit(1)
  const languageName = lang?.name ?? 'Unknown'
```

Then find every place `minInterval` is used in the same file (in the SM-2 update logic) and replace:
```ts
      const finalInterval = Math.max(minInterval, sm2.interval)
```
With:
```ts
      const finalInterval = sm2.interval
```

- [ ] **Step 3: Fix `app/api/generate/route.ts`**

Change:
```ts
  const [lang] = await db
    .select({ name: languages.name, minRuleInterval: languages.minRuleInterval })
    .from(languages)
    .where(eq(languages.id, languageId))
    .limit(1)
  const languageName = lang?.name ?? 'Unknown'
```
To:
```ts
  const [lang] = await db
    .select({ name: languages.name })
    .from(languages)
    .where(eq(languages.id, languageId))
    .limit(1)
  const languageName = lang?.name ?? 'Unknown'
```

- [ ] **Step 4: Fix `app/api/languages/route.ts`**

In the `PUT` handler, the entire body currently reads and saves `minRuleInterval`. Remove that handler or replace it to return 400 if someone tries to set interval (or just remove the `PUT` handler entirely if it only served this purpose — check the file first).

The `PUT` handler should be removed if it only updates `minRuleInterval`. If there are other fields being updated, remove just the `minRuleInterval` parts.

- [ ] **Step 5: Commit**

```bash
git add app/api/check/route.ts app/api/batch-evaluate/route.ts app/api/generate/route.ts app/api/languages/route.ts
git commit -m "feat: remove minRuleInterval from API routes"
```

---

### Task 3: Add `daily_practice_log` creation to session complete endpoint

**Files:**
- Modify: `app/api/sessions/[id]/complete/route.ts`

- [ ] **Step 1: Import `dailyPracticeLog` and add log creation**

At the top of `app/api/sessions/[id]/complete/route.ts`, add to imports:
```ts
import { sessions, tasks, dailyPracticeLog } from '@/lib/db/schema'
```

After the `db.update(sessions)...` call, add:
```ts
  // If this was a daily practice session, record it in the log
  if (session.mode === 'daily') {
    const today = new Date().toISOString().slice(0, 10) // "2026-04-19"
    await db
      .insert(dailyPracticeLog)
      .values({
        userId: user.id,
        languageId: session.languageId,
        sessionId: id,
        date: today,
      })
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/sessions/[id]/complete/route.ts
git commit -m "feat: write daily_practice_log on session complete when mode=daily"
```

---

### Task 4: Update practice page — remove interval UI, add daily auto-start mode

**Files:**
- Modify: `app/(dashboard)/practice/page.tsx`

- [ ] **Step 1: Remove `minRuleInterval` from the `Language` type**

Change:
```ts
type Language = { id: string; name: string; flagEmoji: string | null; minRuleInterval: number }
```
To:
```ts
type Language = { id: string; name: string; flagEmoji: string | null }
```

- [ ] **Step 2: Remove `savingInterval` state and `handleSaveInterval` function**

Delete:
```ts
  const [savingInterval, setSavingInterval] = useState(false)
```
And the entire `handleSaveInterval` function (lines ~89–99).

- [ ] **Step 3: Add `daily` mode detection and auto-start**

After the existing `const isDue = searchParams.get('due') === '1'` line, add:
```ts
  const isDaily = searchParams.get('daily') === '1'
  const dailyLangId = searchParams.get('lang') ?? ''
```

In the rules `useEffect` (after `setRules(data)`), add a branch for daily mode:
```ts
        if (isDaily) {
          const weakRules = data.filter(r => (r.emaScore ?? 1) < 0.6)
          const toSelect = weakRules.length > 0
            ? weakRules
            : data.sort((a, b) => (a.emaScore ?? 1) - (b.emaScore ?? 1)).slice(0, 10)
          setSelectedRules(new Set(toSelect.map(r => r.id)))
        } else if (preselectedRule && data.some(r => r.id === preselectedRule)) {
```
(replace the existing `if (preselectedRule...)` block, adding the new `isDaily` branch before it)

- [ ] **Step 4: Auto-trigger `handleStart` when in daily mode and rules are loaded**

Add a new `useEffect` after the rules-loading effect:
```ts
  const hasAutoStarted = useRef(false)
  useEffect(() => {
    if (!isDaily || loadingRules || selectedRules.size === 0 || hasAutoStarted.current) return
    hasAutoStarted.current = true
    // Override mode to 'daily' for session creation
    handleStart('daily')
  }, [isDaily, loadingRules, selectedRules])
```

- [ ] **Step 5: Update `handleStart` to accept an optional mode override**

Change the function signature:
```ts
  async function handleStart(modeOverride?: string) {
```

And in the session creation body:
```ts
      body: JSON.stringify({
        languageId: selectedLang,
        ruleIds: Array.from(selectedRules),
        taskCount: Math.max(5, selectedRules.size),
        includeVocab,
        mode: modeOverride ?? mode,
      }),
```

- [ ] **Step 6: Remove the interval UI block from the JSX**

Delete the entire block (roughly lines 410–439):
```tsx
              {/* Min rule interval setting */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Minimum interval between rule reviews
                  ...
                </p>
                <div className="flex gap-2">
                  ...
                </div>
              </div>
```

- [ ] **Step 7: Pre-select the daily language on mount**

In the languages `useEffect`, add handling for `dailyLangId`:
```ts
      .then((data: Language[]) => {
        setLanguages(data)
        if (dailyLangId && data.some(l => l.id === dailyLangId)) {
          setSelectedLang(dailyLangId)
        } else if (data.length === 1) {
          setSelectedLang(data[0].id)
        }
        setLoadingLangs(false)
      })
```

- [ ] **Step 8: Commit**

```bash
git add app/(dashboard)/practice/page.tsx
git commit -m "feat: remove minRuleInterval UI, add daily auto-start mode to practice page"
```

---

### Task 5: Update dashboard — show daily practice buttons per language

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Add imports**

Add to the imports at the top:
```ts
import { languages, rules, vocabulary, sessions, ruleStats, dailyPracticeLog } from '@/lib/db/schema'
import { eq, count, and, lt, lte, inArray, sql } from 'drizzle-orm'
```

- [ ] **Step 2: Fetch daily practice status and weak rule counts per language**

After the existing `userLanguages` query result is available, add two new parallel queries inside the `Promise.all`:

```ts
  const [
    userLanguages,
    [{ total: totalRules }],
    [{ total: totalVocab }],
    [{ total: totalSessions }],
    [{ weakCount }],
    [{ dueCount }],
    practicedTodayRows,
    weakRuleCountRows,
  ] = await Promise.all([
    // ... existing queries unchanged ...

    // Which languages were practiced today
    db
      .select({ languageId: dailyPracticeLog.languageId })
      .from(dailyPracticeLog)
      .where(and(
        eq(dailyPracticeLog.userId, user.id),
        eq(dailyPracticeLog.date, new Date().toISOString().slice(0, 10))
      )),

    // Weak rule count per language
    db
      .select({ languageId: ruleStats.languageId ?? rules.languageId, cnt: count() })
      .from(ruleStats)
      .innerJoin(rules, eq(rules.id, ruleStats.ruleId))
      .where(and(eq(ruleStats.userId, user.id), lt(ruleStats.emaScore, 0.6)))
      .groupBy(rules.languageId),
  ])
```

Wait — `ruleStats` doesn't have a `languageId`. Join through `rules` to get it:
```ts
    db
      .select({ languageId: rules.languageId, cnt: count() })
      .from(ruleStats)
      .innerJoin(rules, eq(rules.id, ruleStats.ruleId))
      .where(and(eq(ruleStats.userId, user.id), lt(ruleStats.emaScore, 0.6)))
      .groupBy(rules.languageId),
```

- [ ] **Step 3: Build lookup maps**

After the queries, build helper maps:
```ts
  const practicedToday = new Set(practicedTodayRows.map(r => r.languageId))
  const weakByLang = Object.fromEntries(weakRuleCountRows.map(r => [r.languageId, r.cnt]))
```

- [ ] **Step 4: Update language card JSX**

Replace the existing language card buttons section:
```tsx
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
```

With:
```tsx
                <div className="flex gap-2 items-center">
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/languages/${lang.id}/rules`} />}>
                    Rules
                  </Button>
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/languages/${lang.id}/vocabulary`} />}>
                    Words
                  </Button>
                  {practicedToday.has(lang.id) ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium px-2">✓ Done today</span>
                  ) : (
                    <Button size="sm" nativeButton={false} render={<Link href={`/practice?daily=1&lang=${lang.id}`} />}>
                      Practice · {weakByLang[lang.id] ?? 0} rules
                    </Button>
                  )}
                </div>
```

- [ ] **Step 5: Remove the old "due rules" banner** (optional — it overlaps with new system)

The existing `dueCount` banner (`{dueCount > 0 && ...}`) can be removed since the per-language buttons replace its purpose. Delete the entire block.

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/dashboard/page.tsx
git commit -m "feat: show daily practice buttons per language on dashboard"
```

---

### Task 6: Handle edge case — zero weak rules fallback

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Add total rule count per language for fallback**

Add another query to the `Promise.all`:
```ts
    db
      .select({ languageId: rules.languageId, cnt: count() })
      .from(rules)
      .where(eq(rules.userId, user.id))
      .groupBy(rules.languageId),
```

Store as `totalRuleCountRows` and build a map:
```ts
  const totalByLang = Object.fromEntries(totalRuleCountRows.map(r => [r.languageId, r.cnt]))
```

- [ ] **Step 2: Show fallback count in button when no weak rules**

Update the button label:
```tsx
                      Practice · {weakByLang[lang.id]
                        ? `${weakByLang[lang.id]} weak`
                        : `${Math.min(10, totalByLang[lang.id] ?? 0)} rules`} 
```

This shows "X weak" if weak rules exist, or "X rules" (up to 10) for the fallback case.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/dashboard/page.tsx
git commit -m "feat: handle zero-weak-rules fallback in daily practice button"
```

---

## Self-Review

**Spec coverage:**
- ✅ Remove `minRuleInterval` — Tasks 1, 2, 4
- ✅ New `daily_practice_log` table — Task 1
- ✅ Dashboard button per language with count — Tasks 5, 6
- ✅ Button disappears after practice — Task 3 writes log, Task 5 reads it
- ✅ Auto-select weak rules (< 0.6, fallback top-10) — Task 4 step 3
- ✅ Session created with `mode='daily'` — Task 4 step 5
- ✅ Log created on completion — Task 3
- ✅ History works via existing session — no changes needed (sessionId in log)

**Type consistency:**
- `dailyPracticeLog` exported from schema, imported in complete route and dashboard — consistent
- `mode: 'daily'` string used in session creation and completion check — consistent
- `date` stored as ISO string `"YYYY-MM-DD"` in both write (complete route) and read (dashboard query) — consistent
