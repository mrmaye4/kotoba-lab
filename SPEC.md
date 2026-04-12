# LangLearn — Project Spec for Claude Code

## What is this
A Next.js 14 app for learning language rules, grammar, and vocabulary with AI-generated practice tasks and spaced repetition. Single user (me).

## Tech stack
- **Framework**: Next.js 14, App Router, TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **AI**: Anthropic Claude API (`claude-sonnet-4-20250514`)
- **Auth**: Supabase Auth (email/password)

## Project structure
```
app/
  (auth)/
    login/page.tsx          ✅ done
    register/page.tsx       ✅ done
  (dashboard)/
    layout.tsx              ✅ done — sidebar with language nav
    dashboard/page.tsx      ✅ done — overview with stats
    languages/[id]/
      rules/page.tsx        ✅ done — rules list + add modal
      vocabulary/page.tsx   ✅ done — vocab list + import + add
      vocabulary/review/page.tsx  ✅ done — Anki-style flip cards
    practice/
      page.tsx              ❌ TODO — session setup
      session/[id]/page.tsx ❌ TODO — active task session
    progress/page.tsx       ❌ TODO — stats + weak rules
  api/
    generate/route.ts       ✅ done
    check/route.ts          ✅ done
    vocabulary/import/route.ts  ✅ done
    vocabulary/review/route.ts  ✅ done
    rules/route.ts          ❌ TODO (basic CRUD)
    sessions/route.ts       ❌ TODO
    stats/route.ts          ❌ TODO
lib/
  supabase/client.ts        ❌ TODO (see snippet below)
  supabase/server.ts        ❌ TODO (see snippet below)
  claude/generate.ts        ✅ done
  claude/evaluate.ts        ✅ done
  vocabulary/sm2.ts         ✅ done
  vocabulary/parser.ts      ✅ done
types/index.ts              ✅ done
supabase/schema.sql         ✅ done — run this first
middleware.ts               ❌ TODO (see snippet below)
```

## Environment variables (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Supabase client snippets (create these)

### lib/supabase/client.ts
```ts
import { createBrowserClient } from '@supabase/ssr'
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### lib/supabase/server.ts
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        },
      },
    }
  )
}
```

### middleware.ts (project root)
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
                     request.nextUrl.pathname.startsWith('/register')
  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
```

---

## Database schema (already in supabase/schema.sql, run it)

Key tables:
- `languages` — id, user_id, name, flag_emoji
- `rules` — id, language_id, user_id, title, description, formula, type (rule|structure|collocation), ai_context, difficulty 1–5, examples jsonb
- `rule_stats` — rule_id, ema_score (0–1), attempts_total, weak_flag — auto-created by trigger on rule insert, auto-updated by trigger on task answer
- `vocabulary` — id, language_id, user_id, word, translation, context, ease_factor, interval, repetitions, next_review
- `sessions` — id, user_id, language_id, rule_ids[], status (active|completed), total_tasks, completed, avg_score
- `tasks` — id, session_id, rule_id, type, prompt, options jsonb, correct_answer, ai_check_context, user_answer, score (0–10), feedback, is_correct

All tables have RLS: users only see their own data.

---

## Design system

Consistent visual style across all pages:
- **Background**: `#F7F6F3` (page), `#ffffff` (cards), `#f7f6f3` (inputs)
- **Primary**: `#1a1a1a` (buttons, active states, logo)
- **Muted text**: `#888`, `#aaa`, `#bbb`
- **Borders**: `#e8e8e8` (cards), `#e8e6df` (sidebar)
- **Radius**: `rounded-xl` (cards), `rounded-lg` (inputs/buttons), `rounded-2xl` (modals)
- **Font sizes**: `text-sm` for body, `text-xs` for labels/meta, `text-xl`/`text-2xl` for headings
- **Sidebar width**: `w-56`, sticky, `bg-[#F7F6F3]`
- **Status colors**: amber for due/warning, red for errors, teal/green for success

Modal pattern:
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center px-4"
  style={{ background: 'rgba(0,0,0,0.25)' }} onClick={onClose}>
  <div className="bg-white rounded-2xl border border-[#e8e8e8] p-6 w-full max-w-sm"
    onClick={e => e.stopPropagation()}>
    ...
  </div>
</div>
```

---

## What still needs to be built

### 1. `/practice/page.tsx` — Session setup
User flow:
1. Select language (dropdown if multiple)
2. Select rules (checkboxes, shows ema_score bar per rule, weak rules highlighted)
3. Options: task count (5/10/15/20), include vocabulary toggle
4. "Start practice" → POST /api/sessions (create session) → POST /api/generate (generate tasks) → redirect to `/practice/session/[id]`

API needed — `POST /api/sessions`:
```ts
// create session, return { id }
const { data } = await supabase.from('sessions').insert({
  user_id, language_id, rule_ids, status: 'active',
  total_tasks: taskCount, completed: 0,
  settings: { task_count, include_vocab }
}).select().single()
```

### 2. `/practice/session/[id]/page.tsx` — Active session
User flow:
1. Load tasks for session from DB
2. Show one task at a time with progress bar
3. Per task type, render correct input UI:
   - `mcq` → 4 option buttons (A/B/C/D)
   - `fill_blank` → text input
   - `transform` → textarea
   - `open_write` → textarea (larger)
   - `vocabulary` → text input or option buttons if options present
   - `error_find` → textarea
   - `translate` → textarea
4. On submit → POST /api/check → show score + feedback
5. "Next" → move to next task
6. After last task → show session summary screen

Task card structure:
```tsx
<div className="bg-white rounded-2xl border border-[#e8e8e8] p-6">
  <div className="text-xs text-[#888] mb-3">{TASK_TYPE_LABELS[task.type]}</div>
  <p className="text-base text-[#1a1a1a] mb-4">{task.prompt}</p>
  {/* input depending on type */}
  <button onClick={handleSubmit}>Проверить</button>
</div>
```

After check — show feedback card:
```tsx
<div className={`rounded-xl p-4 mt-4 ${score >= 7 ? 'bg-[#E1F5EE]' : score >= 4 ? 'bg-[#FAEEDA]' : 'bg-[#FCEBEB]'}`}>
  <div className="font-medium">{score}/10</div>
  <p className="text-sm mt-1">{feedback}</p>
</div>
```

Session summary screen (when completed === total_tasks):
- avg score, breakdown by task type, list of weak rules from this session
- buttons: "Practice again" | "Back to dashboard"

### 3. `/progress/page.tsx` — Progress & weak rules

Sections:
1. **Overall stats** — total sessions, avg score, total tasks answered
2. **Per-language progress** — for each language: avg ema across rules, vocab count, sessions
3. **Weak rules** — rules where `weak_flag = true` or `ema_score < 0.6`, sorted by ema_score asc, with button "Practice this rule"
4. **Recent sessions** — last 10 sessions with date, language, score, task count

Query for weak rules:
```ts
const { data } = await supabase
  .from('rule_stats')
  .select('*, rule:rules(*)')
  .eq('user_id', user.id)
  .lt('ema_score', 0.6)
  .order('ema_score', { ascending: true })
  .limit(20)
```

---

## Core logic — how AI generation works

File: `lib/claude/generate.ts`

```
generateTasks({ rules, vocabulary, taskCount, language })
  → picks task types by weight (open_write most common)
  → picks rule per task weighted by (1 - ema_score) so weak rules appear more
  → builds prompt with rule descriptions + ai_context
  → calls Claude API
  → returns tasks[]
```

File: `lib/claude/evaluate.ts`

```
evaluateAnswer(task, userAnswer)
  → mcq: auto-check
  → fill_blank: auto-check, fallback to AI for partial credit
  → everything else: Claude scores 0–10, returns feedback in Russian
```

After check → DB trigger `on_task_answered` auto-updates `rule_stats.ema_score`:
```
new_ema = 0.3 * (score/10) + 0.7 * old_ema
weak_flag = new_ema < 0.6
```

---

## Task types

| type | description | check method |
|------|-------------|--------------|
| `mcq` | 4-option multiple choice | auto |
| `fill_blank` | fill in the gap / conjugate | auto + AI |
| `transform` | rewrite sentence | AI |
| `open_write` | write freely using the rule | AI |
| `vocabulary` | insert word by meaning | auto + AI |
| `error_find` | find and fix the error | AI |
| `translate` | translate + apply rule | AI |

---

## Spaced repetition (SM-2)

File: `lib/vocabulary/sm2.ts`

Buttons: Again (q=0) / Hard (q=2) / Good (q=4) / Easy (q=5)

```
if q < 3: reset (reps=0, interval=1)
else:
  reps=0 → interval=1
  reps=1 → interval=6
  reps>1 → interval = round(interval * ease_factor)
  reps++
ease_factor = max(1.3, ef + 0.1 - (5-q)*(0.08+(5-q)*0.02))
next_review = today + interval days
```

Review page (`vocabulary/review/page.tsx`) fetches cards where `next_review <= now()`.
Cards accumulate daily — if you skip a day, yesterday's cards + today's cards both appear.

---

## Vocabulary import

File: `lib/vocabulary/parser.ts`

Supports:
- **CSV** (Quizlet export): `word,translation,"example"`
- **TSV** (Anki export): `word\ttranslation\texample`

Auto-detects format from file extension or content.
Skips header rows, handles quoted fields with commas inside.

API: `POST /api/vocabulary/import` → `{ language_id, format, content }` → inserts with SM-2 defaults, skips duplicates.

---

## Key UX patterns to keep consistent

- Modals: dark overlay, `rounded-2xl`, click outside to close
- Empty states: centered, emoji, description, CTA button
- Loading states: simple "Загружаем..." text, no spinners
- Errors: `text-red-500 bg-red-50 px-3 py-2 rounded-lg text-xs`
- Breadcrumbs: `Dashboard / 🇬🇧 English` with `/` separator in `text-xs text-[#888]`
- All labels uppercase + tracking-wide: `text-xs font-medium text-[#888] uppercase tracking-wide`
- Buttons: primary = `bg-[#1a1a1a] text-white`, secondary = `border border-[#e8e8e8] text-[#666]`
- Progress bars: `h-1.5 bg-[#f0efe9] rounded-full` with colored fill

---

## What to do next (priority order)

1. Create `lib/supabase/client.ts` and `lib/supabase/server.ts`
2. Create `middleware.ts`
3. Run `supabase/schema.sql` in Supabase SQL editor
4. Build `app/(dashboard)/practice/page.tsx`
5. Build `app/(dashboard)/practice/session/[id]/page.tsx`
6. Build `app/(dashboard)/progress/page.tsx`
7. Build `app/api/sessions/route.ts` (CRUD)
8. Build `app/api/stats/route.ts`
9. Test end-to-end: add language → add rules → generate session → complete tasks → check progress
