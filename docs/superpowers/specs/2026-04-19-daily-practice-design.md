# Daily Practice Feature — Design Spec

## Overview

Replace the per-language "Minimum interval between rule reviews" setting with a daily practice system. Each language gets a daily practice button on the dashboard that shows how many weak rules are due. Completing a session records the day as done and the button disappears.

## What's Being Removed

`minRuleInterval` field from the `languages` table and all references:
- `lib/db/schema.ts`
- `app/(dashboard)/practice/page.tsx`
- `app/api/languages/route.ts`
- `app/api/check/route.ts`
- `app/api/generate/route.ts`
- `app/api/batch-evaluate/route.ts`

## Database

New table `daily_practice_log`:

```
id          uuid        PK, default gen_random_uuid()
userId      uuid        NOT NULL
languageId  uuid        NOT NULL  → languages.id
sessionId   uuid        NOT NULL  → sessions.id
date        date        NOT NULL  (UTC date of the practice)
createdAt   timestamp   NOT NULL  default now()
```

No unique constraint needed — one record per completed session. Checking "practiced today" is a simple `WHERE userId = ? AND languageId = ? AND date = today`.

Migration: `drizzle-kit generate` then `drizzle-kit push`.

## Rule Selection Logic

For a daily practice session on a given language:
1. Fetch all `ruleStats` for the language where `emaScore < 0.6`, ordered by `emaScore ASC`
2. If none exist: fallback to top-10 rules with the lowest `emaScore` regardless of threshold
3. Pass selected `ruleIds` into the existing session/generate flow

## Dashboard Changes (`app/(dashboard)/dashboard/page.tsx`)

For each language card, fetch alongside existing queries:
- Count of weak rules: `ruleStats WHERE languageId = ? AND emaScore < 0.6`
- Daily practice done: `daily_practice_log WHERE userId = ? AND languageId = ? AND date = today`

Language card UI:
- **Not practiced today + weak rules exist** → button: `{flagEmoji} {name} · {count} rules`  
  Navigates to `/practice?lang=<id>&daily=1`
- **Practiced today** → green "✓ Done today" badge instead of button
- **No weak rules** → fallback button with top-10 count, same behaviour

## Practice Page Changes (`app/(dashboard)/practice/page.tsx`)

When `?daily=1&lang=<id>` is in the URL:
- Skip manual rule selection UI
- Auto-select weak rules for the language (same logic as above)
- Auto-start session immediately (no config screen)
- Remove the "Minimum interval" setting from the UI entirely

## Session Completion

In `app/api/sessions/[id]/complete/route.ts` (or wherever session completion is handled):
- After marking session as completed, check if the session was a daily practice session (`mode = 'daily'` or by URL flag stored on the session)
- If yes: insert a row into `daily_practice_log` with `{ userId, languageId, sessionId, date: today }`

Store `mode = 'daily'` on the session at creation time so completion logic can identify it without needing the URL.

## History

No changes needed. `daily_practice_log.sessionId` links to the existing session, which already stores all tasks, answers, scores, and AI feedback. The existing `/history` and `/history/[id]` pages cover this.

## Out of Scope

- Streaks or gamification
- Push notifications / reminders
- Per-language practice time targets