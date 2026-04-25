# Story Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `story` session mode where Claude generates two rule-based stories for full-text translation with collapsible grammar hints.

**Architecture:** New `story_translate` task type stored in DB enum. Generation uses a single Claude call producing both stories + hints JSON. Session page gets a `StoryMode` component (one story at a time, hints toggle, large textarea). Evaluation uses extended `evaluateAnswer` that parses the `aiCheckContext` JSON for direction and hints.

**Tech Stack:** Next.js App Router, Drizzle ORM, TypeScript, Anthropic SDK (claude-sonnet-4-6)

---

### Task 1: Add types and update schema

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Add `'story'` to `SessionMode` and `'story_translate'` to `TaskType` in `types/index.ts`**

```ts
export type SessionMode = 'practice' | 'test' | 'chaos' | 'story'
export type DifficultyLevel = 'any' | 'easy' | 'medium' | 'hard'

export type TaskType =
  | 'mcq'
  | 'fill_blank'
  | 'transform'
  | 'open_write'
  | 'vocabulary'
  | 'error_find'
  | 'translate'
  | 'story_translate'

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  mcq: 'Multiple choice',
  fill_blank: 'Fill in the blank',
  transform: 'Transform',
  open_write: 'Free writing',
  vocabulary: 'Vocabulary',
  error_find: 'Find the error',
  translate: 'Translate',
  story_translate: 'Story translation',
}
```

Also update `Session.settings` to include `paragraph_count`:
```ts
export type Session = {
  id: string
  userId: string
  languageId: string
  ruleIds: string[]
  status: 'active' | 'completed'
  mode: SessionMode
  theme: string | null
  totalTasks: number
  completed: number
  avgScore: number | null
  settings: {
    task_count: number
    include_vocab: boolean
    paragraph_count?: number
    allowed_types?: TaskType[]
    difficulty?: DifficultyLevel
  } | null
}
```

- [ ] **Step 2: Add `'story_translate'` to `taskTypeEnum` in `lib/db/schema.ts`**

Find the line:
```ts
export const taskTypeEnum = pgEnum('task_type', [
  'mcq',
  'fill_blank',
  'transform',
  'open_write',
  'vocabulary',
  'error_find',
  'translate',
])
```

Change to:
```ts
export const taskTypeEnum = pgEnum('task_type', [
  'mcq',
  'fill_blank',
  'transform',
  'open_write',
  'vocabulary',
  'error_find',
  'translate',
  'story_translate',
])
```

- [ ] **Step 3: Generate and push migration**

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

Expected: new migration file created, `story_translate` value added to the `task_type` enum in Supabase.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts lib/db/schema.ts drizzle/
git commit -m "feat: add story mode types and story_translate task type enum"
```

---

### Task 2: Add `generateStoryTasks` to generate.ts

**Files:**
- Modify: `lib/claude/generate.ts`

- [ ] **Step 1: Add the `generateStoryTasks` export function at the end of `lib/claude/generate.ts`**

```ts
export async function generateStoryTasks({
  rules,
  language,
  paragraphCount,
  interfaceLanguage,
}: {
  rules: RuleWithStats[]
  language: string
  paragraphCount: number
  interfaceLanguage: string
}): Promise<GeneratedTask[]> {
  const rulesBlock = rules.map(r => buildRuleBlock(r)).join('\n\n---\n\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: `You are a language teacher creating story translation exercises for ${language} learners.
Return ONLY valid JSON — no markdown, no explanation outside the JSON object.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Create two short stories. Each story must be exactly ${paragraphCount} paragraph(s).

The stories must naturally use grammar constructions from these rules:
${rulesBlock}

Requirements:
- "story_target": an original story written in ${language} that uses the grammar constructions from the rules
- "story_english": a DIFFERENT original story on the same theme written in English — when translated to ${language} it should require using the same grammar constructions
- The two stories share a theme but are NOT translations of each other
- "hints": 3-5 short tips in ${interfaceLanguage} about which grammar constructions to apply and when — shown to the student only if they ask for help

Return exactly this JSON:
{
  "story_target": "...",
  "story_english": "...",
  "hints": ["hint 1", "hint 2", ...]
}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  let parsed: { story_target: string; story_english: string; hints: string[] }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Failed to parse story generation response')
  }

  return [
    {
      rule_id: null as unknown as string,
      type: 'story_translate' as TaskType,
      prompt: parsed.story_target,
      ai_check_context: JSON.stringify({ direction: 'to_en', language, hints: parsed.hints }),
    },
    {
      rule_id: null as unknown as string,
      type: 'story_translate' as TaskType,
      prompt: parsed.story_english,
      ai_check_context: JSON.stringify({ direction: 'to_target', language, hints: parsed.hints }),
    },
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/claude/generate.ts
git commit -m "feat: add generateStoryTasks to generate.ts"
```

---

### Task 3: Route story mode in generate API

**Files:**
- Modify: `app/api/generate/route.ts`

- [ ] **Step 1: Import `generateStoryTasks` and add story mode branch**

At the top of `app/api/generate/route.ts`, add `generateStoryTasks` to the import:
```ts
import { generateTasks, generateTheme, generateStoryTasks } from '@/lib/claude/generate'
```

After the existing `const mode: SessionMode = ...` line, add a branch before the existing generate logic:

```ts
  // Story mode: generate two story translation tasks
  if (mode === 'story') {
    const paragraphCount = (session.settings as { paragraph_count?: number } | null)?.paragraph_count ?? 2
    const storyTasks = await generateStoryTasks({
      rules: rulesWithStats,
      language: languageName,
      paragraphCount,
      interfaceLanguage,
    })

    const inserted = await db
      .insert(tasks)
      .values(
        storyTasks.map(t => ({
          sessionId,
          ruleId: null,
          type: t.type,
          prompt: t.prompt,
          options: null,
          correctAnswer: null,
          aiCheckContext: t.ai_check_context ?? null,
        }))
      )
      .returning()

    return NextResponse.json({ tasks: inserted, theme: null })
  }
```

Place this block before the existing theme generation / `generateTasks` call so story sessions exit early.

- [ ] **Step 2: Commit**

```bash
git add app/api/generate/route.ts
git commit -m "feat: route story mode to generateStoryTasks in generate API"
```

---

### Task 4: Add story_translate evaluation in evaluate.ts

**Files:**
- Modify: `lib/claude/evaluate.ts`

- [ ] **Step 1: Add `story_translate` branch in `evaluateAnswer`**

In `lib/claude/evaluate.ts`, add a new branch at the top of `evaluateAnswer`, before the MCQ check:

```ts
  // Story translation — AI evaluation with direction and grammar hints
  if (type === 'story_translate') {
    let ctx: { direction?: string; language?: string; hints?: string[] } = {}
    try { ctx = JSON.parse(aiCheckContext ?? '{}') } catch { /* ignore */ }

    const targetLang = ctx.language ?? 'the target language'
    const direction = ctx.direction === 'to_en' ? 'English' : targetLang
    const hintsBlock = ctx.hints?.length
      ? `\nGrammar constructions the student should have used:\n${ctx.hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
      : ''

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: [
        {
          type: 'text',
          text: `You are evaluating a full-text translation exercise.
Score from 0 to 10 and give feedback in ${interfaceLanguage}.
Return ONLY JSON: {"score": <number 0-10>, "feedback": "<text>"}
No markdown.

Scale: 10=excellent (accurate + natural), 8-9=good (minor errors), 6-7=acceptable (some errors but understandable), 4-5=partial (significant errors), 0-3=poor (major errors or wrong language).`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Original text:
${prompt}

Student's translation into ${direction}:
${userAnswer || '(empty)'}
${hintsBlock}

Evaluate: accuracy of meaning, natural use of the grammar constructions, and overall fluency.`,
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    try {
      const { score, feedback } = JSON.parse(cleaned)
      return { score: Math.min(10, Math.max(0, Number(score))), feedback, isCorrect: score >= 6 }
    } catch {
      return { score: 0, feedback: 'Failed to evaluate translation', isCorrect: false }
    }
  }
```

Note: `isCorrect` threshold is 6 (not 7) for story translations — full-text translation is harder.

- [ ] **Step 2: Commit**

```bash
git add lib/claude/evaluate.ts
git commit -m "feat: add story_translate evaluation with grammar hint context"
```

---

### Task 5: Add StoryMode component to session page

**Files:**
- Modify: `app/(dashboard)/practice/session/[id]/page.tsx`

- [ ] **Step 1: Add `StoryMode` component before the `// ─── Main session page` comment**

```tsx
// ─── Story mode (one story at a time, full-text translation) ─────────────────

function StoryMode({
  tasks,
  session,
  onFinish,
}: {
  tasks: Task[]
  session: Session
  onFinish: (updatedTasks: Task[]) => void
}) {
  const [current, setCurrent] = useState(0)
  const [answer, setAnswer] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{ score: number; feedback: string; isCorrect: boolean } | null>(null)
  const [localTasks, setLocalTasks] = useState(tasks)
  const [showHints, setShowHints] = useState(false)

  const task = localTasks[current]

  let hints: string[] = []
  try {
    const ctx = JSON.parse(task?.aiCheckContext ?? '{}')
    hints = ctx.hints ?? []
  } catch { /* ignore */ }

  const direction = (() => {
    try {
      const ctx = JSON.parse(task?.aiCheckContext ?? '{}')
      return ctx.direction === 'to_en' ? 'English' : (ctx.language ?? 'the target language')
    } catch { return 'the other language' }
  })()

  async function handleCheck() {
    if (!answer.trim()) return
    setChecking(true)
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, userAnswer: answer }),
    })
    const data = await res.json()
    setResult(data)
    setLocalTasks(prev =>
      prev.map((t, i) =>
        i === current
          ? { ...t, userAnswer: answer, score: data.score, feedback: data.feedback, isCorrect: data.isCorrect }
          : t
      )
    )
    setChecking(false)
  }

  function handleNext() {
    setResult(null)
    setAnswer('')
    setShowHints(false)
    if (current + 1 >= localTasks.length) {
      fetch(`/api/sessions/${session.id}/complete`, { method: 'POST' })
      onFinish(localTasks)
    } else {
      setCurrent(c => c + 1)
    }
  }

  if (current >= localTasks.length) {
    onFinish(localTasks)
    return null
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-foreground">Story</h1>
        <span className="text-sm text-muted-foreground">{current + 1} / {localTasks.length}</span>
      </div>

      <div className="h-1.5 bg-muted rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${(current / localTasks.length) * 100}%` }}
        />
      </div>

      {/* Story text */}
      <div className="bg-card rounded-2xl border border-border p-6 mb-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Translate into {direction}</p>
        <div className="text-base text-foreground leading-relaxed whitespace-pre-wrap">{task.prompt}</div>
      </div>

      {/* Hints */}
      {hints.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setShowHints(h => !h)}
            className="text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
          >
            {showHints ? 'Hide hints' : 'Show hints'}
          </button>
          {showHints && (
            <ul className="mt-2 bg-muted/50 rounded-xl p-4 flex flex-col gap-1.5">
              {hints.map((h, i) => (
                <li key={i} className="text-sm text-foreground/80">• {h}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Translation textarea */}
      <div className="bg-card rounded-2xl border border-border p-4 mb-3">
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          disabled={!!result || checking}
          placeholder="Your translation..."
          rows={8}
          className="w-full bg-transparent text-sm text-foreground outline-none resize-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        {result && (
          <div className={`rounded-xl p-4 mt-3 ${
            result.score >= 7 ? 'bg-emerald-100 dark:bg-emerald-950/40' :
            result.score >= 4 ? 'bg-amber-100 dark:bg-amber-950/40' :
            'bg-red-100 dark:bg-red-950/40'
          }`}>
            <div className="font-semibold text-sm text-foreground">{result.score}/10</div>
            <p className="text-sm mt-1 text-foreground/80">{result.feedback}</p>
          </div>
        )}
      </div>

      {!result ? (
        <button
          onClick={handleCheck}
          disabled={checking || !answer.trim()}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {checking ? 'Checking...' : 'Submit translation'}
        </button>
      ) : (
        <button
          onClick={handleNext}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {current + 1 >= localTasks.length ? 'Finish' : 'Next story →'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire `StoryMode` into the main session page**

Find:
```ts
  // Practice and chaos mode use the same one-task-at-a-time UI
  if (mode === 'practice' || mode === 'chaos') {
    return <PracticeMode tasks={tasks} session={session} onFinish={handleFinish} />
  }

  // Test mode
  return <TestMode tasks={tasks} session={session} onFinish={handleFinish} />
```

Replace with:
```ts
  if (mode === 'story') {
    return <StoryMode tasks={tasks} session={session} onFinish={handleFinish} />
  }

  // Practice and chaos mode use the same one-task-at-a-time UI
  if (mode === 'practice' || mode === 'chaos') {
    return <PracticeMode tasks={tasks} session={session} onFinish={handleFinish} />
  }

  // Test mode
  return <TestMode tasks={tasks} session={session} onFinish={handleFinish} />
```

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/practice/session/[id]/page.tsx"
git commit -m "feat: add StoryMode component to session page"
```

---

### Task 6: Update practice page with story mode UI

**Files:**
- Modify: `app/(dashboard)/practice/page.tsx`

- [ ] **Step 1: Add `story` to the `MODES` array**

Find:
```ts
const MODES: { value: SessionMode; label: string; description: string }[] = [
  { value: 'practice', label: 'Practice', description: 'Immediate feedback after each task' },
  { value: 'test', label: 'Test', description: 'Answer all tasks, then evaluate' },
  { value: 'chaos', label: 'Chaos', description: 'Mixed rules with a shared theme' },
]
```

Change to:
```ts
const MODES: { value: SessionMode; label: string; description: string }[] = [
  { value: 'practice', label: 'Practice', description: 'Immediate feedback after each task' },
  { value: 'test', label: 'Test', description: 'Answer all tasks, then evaluate' },
  { value: 'chaos', label: 'Chaos', description: 'Mixed rules with a shared theme' },
  { value: 'story', label: 'Story', description: 'Translate two stories built around your rules' },
]
```

- [ ] **Step 2: Add `paragraphCount` state variable**

After the existing `const [mode, setMode] = useState<SessionMode>('practice')` line, add:
```ts
  const [paragraphCount, setParagraphCount] = useState(2)
```

- [ ] **Step 3: Add paragraph count selector and hide task count when story mode is active**

Find the task count section in the JSX (the block with `TASK_COUNTS`). It currently shows always. Wrap it in a condition so it only shows when `mode !== 'story'`:

```tsx
              {/* Task count — hidden in story mode (always 2 tasks) */}
              {mode !== 'story' && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Tasks</p>
                  <div className="flex gap-2">
                    {TASK_COUNTS.map(n => (
                      <button
                        key={n}
                        onClick={() => setTaskCount(n)}
                        className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                          taskCount === n
                            ? 'bg-foreground text-background border-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Paragraph count — shown only in story mode */}
              {mode === 'story' && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Paragraphs per story</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setParagraphCount(n)}
                        className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                          paragraphCount === n
                            ? 'bg-foreground text-background border-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
```

- [ ] **Step 4: Pass `paragraphCount` in session creation and set `taskCount` to 2 for story mode**

In `handleStart`, find the session creation fetch body:
```ts
        body: JSON.stringify({
          languageId: selectedLang,
          ruleIds: Array.from(selectedRules),
          taskCount: modeOverride === 'daily' ? Math.max(5, selectedRules.size) : taskCount,
          includeVocab,
          mode: modeOverride ?? mode,
        }),
```

Change to:
```ts
        const effectiveMode = modeOverride ?? mode
        const effectiveTaskCount =
          modeOverride === 'daily' ? Math.max(5, selectedRules.size) :
          effectiveMode === 'story' ? 2 :
          taskCount

        body: JSON.stringify({
          languageId: selectedLang,
          ruleIds: Array.from(selectedRules),
          taskCount: effectiveTaskCount,
          includeVocab,
          mode: effectiveMode,
          paragraphCount: effectiveMode === 'story' ? paragraphCount : undefined,
        }),
```

- [ ] **Step 5: Pass `paragraphCount` through session creation API to settings**

In `app/api/sessions/route.ts`, the POST handler receives the body. Update it to include `paragraphCount` in the session settings:

Find:
```ts
  const { languageId, ruleIds, taskCount, includeVocab, mode } = await request.json()
```

Change to:
```ts
  const { languageId, ruleIds, taskCount, includeVocab, mode, paragraphCount } = await request.json()
```

And update the settings object:
```ts
      settings: {
        task_count: taskCount ?? 10,
        include_vocab: includeVocab ?? false,
        ...(paragraphCount ? { paragraph_count: paragraphCount } : {}),
      },
```

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/practice/page.tsx" app/api/sessions/route.ts
git commit -m "feat: add story mode UI to practice page with paragraph count selector"
```

---

## Self-Review

**Spec coverage:**
- ✅ New session mode `story` — Task 1, 6
- ✅ New task type `story_translate` — Task 1 (types + schema + migration)
- ✅ Paragraph count configurable (1/2/3/5) — Task 6
- ✅ Single Claude call generates both stories + hints — Task 2
- ✅ Stories tied to selected rules — Task 2 (rules passed to prompt)
- ✅ Session has exactly 2 tasks — Task 3 (exits early), Task 6 (taskCount=2)
- ✅ Story text displayed, textarea for translation — Task 5 (StoryMode)
- ✅ Hints behind toggle button — Task 5
- ✅ AI evaluation with direction + hints context — Task 4
- ✅ Task count hidden in story mode, paragraph count shown — Task 6

**Type consistency:**
- `'story_translate'` used in Task 1 (types), Task 2 (generate), Task 4 (evaluate) — consistent
- `'story'` used in Task 1 (SessionMode), Task 3 (generate route), Task 5 (session page), Task 6 (practice page) — consistent
- `aiCheckContext` format `{ direction, language, hints }` written in Task 2, read in Tasks 4 and 5 — consistent
- `paragraph_count` in session settings written in Task 6 (sessions route), read in Task 3 (generate route) — consistent

**Placeholder check:** No TBD, no "handle edge cases", all code blocks complete.