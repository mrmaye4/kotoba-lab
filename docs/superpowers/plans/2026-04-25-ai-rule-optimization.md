# AI Rule Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-powered "Optimize rules" flow that semantically groups rules, generates one merged rule per group, and archives originals while inheriting their learning progress.

**Architecture:** MapReduce grouping (chunks of 30, parallel Claude calls, single consolidation step) followed by parallel per-group merge generation. Full preview+edit UI at `/languages/[id]/optimize` before any destructive changes. Apply runs in a single DB transaction.

**Tech Stack:** Next.js App Router, Drizzle ORM v0.45, Supabase (postgres-js), Anthropic SDK (`claude-sonnet-4-6`), React, TypeScript

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `lib/db/schema.ts` | Modify | Add `archived` to rules; add `optimizationSessions` and `optimizationGroups` tables |
| `app/api/rules/route.ts` | Modify | Filter `archived = false` in GET |
| `app/api/generate/route.ts` | Modify | Filter `archived = false` in rule query |
| `app/(dashboard)/languages/[id]/rules/page.tsx` | Modify | Add "Optimize rules" button |
| `lib/optimize/grouping.ts` | Create | MapReduce grouping logic (Claude calls) |
| `lib/optimize/merging.ts` | Create | Per-group merged rule generation (Claude call) |
| `app/api/optimize/start/route.ts` | Create | POST: create session + run grouping |
| `app/api/optimize/[sessionId]/route.ts` | Create | GET: session state + groups with source rule details |
| `app/api/optimize/[sessionId]/groups/route.ts` | Create | PATCH: update group fields |
| `app/api/optimize/[sessionId]/generate/route.ts` | Create | POST: generate merged rules for all groups in parallel |
| `app/api/optimize/[sessionId]/apply/route.ts` | Create | POST: transaction — create new rules, archive old |
| `app/(dashboard)/languages/[id]/optimize/page.tsx` | Create | Full optimization UI (setup → grouping → review → generate → apply) |

---

## Task 1: Schema — add `archived`, `optimizationSessions`, `optimizationGroups`

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Add `archived` column to `rules` table**

In `lib/db/schema.ts`, inside the `rules` table definition, add after `createdAt`:
```typescript
archived: boolean('archived').notNull().default(false),
```

(`boolean` is already imported)

- [ ] **Step 2: Add two new tables at the end of schema.ts**

After the `dailyPracticeLog` table, append:

```typescript
// Optimization sessions
export const optimizationSessions = pgTable('optimization_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  languageId: uuid('language_id').notNull(),
  userId: uuid('user_id').notNull(),
  status: text('status').notNull().default('pending'),
  // 'pending' | 'grouping' | 'grouped' | 'generating' | 'ready' | 'applied'
  filterCategoryId: uuid('filter_category_id'),
  sourceRuleIds: uuid('source_rule_ids').array().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  appliedAt: timestamp('applied_at'),
})

// Groups within an optimization session
export const optimizationGroups = pgTable('optimization_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => optimizationSessions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sourceRuleIds: uuid('source_rule_ids').array().notNull(),
  excluded: boolean('excluded').notNull().default(false),
  mergedTitle: text('merged_title'),
  mergedDescription: text('merged_description'),
  mergedFormula: text('merged_formula'),
  mergedType: text('merged_type'),
  mergedAiContext: text('merged_ai_context'),
  mergedDifficulty: integer('merged_difficulty'),
  mergedExamples: jsonb('merged_examples').$type<string[]>(),
  generationStatus: text('generation_status').notNull().default('pending'),
  // 'pending' | 'generating' | 'done' | 'error'
})
```

- [ ] **Step 3: Push schema**

```bash
npm run db:push
```

Expected: Drizzle detects `archived` column added to `rules`, and two new tables. Confirm all changes.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: add archived column and optimization session/group tables"
```

---

## Task 2: Filter archived rules from existing queries

**Files:**
- Modify: `app/api/rules/route.ts`
- Modify: `app/api/generate/route.ts`

- [ ] **Step 1: Add `archived` filter to GET /api/rules**

In `app/api/rules/route.ts`, add `eq` import check (already imported), then in the GET handler change the where clause:

```typescript
// Before:
.where(and(eq(rules.languageId, languageId), eq(rules.userId, user.id))),

// After (both the rulesRows query and the linkRows query):
.where(and(eq(rules.languageId, languageId), eq(rules.userId, user.id), eq(rules.archived, false))),
```

Apply to both `rulesRows` and `linkRows` queries inside the `GET` function.

- [ ] **Step 2: Add `archived` filter to generate route**

In `app/api/generate/route.ts`, find the rule query (`.where(and(inArray(rules.id, ruleIds), eq(rules.userId, user.id)))`), change to:

```typescript
.where(and(inArray(rules.id, ruleIds), eq(rules.userId, user.id), eq(rules.archived, false)))
```

- [ ] **Step 3: Commit**

```bash
git add app/api/rules/route.ts app/api/generate/route.ts
git commit -m "feat: exclude archived rules from rules and generate queries"
```

---

## Task 3: Grouping library

**Files:**
- Create: `lib/optimize/grouping.ts`

- [ ] **Step 1: Create `lib/optimize/grouping.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type RuleForGrouping = {
  id: string
  title: string
  description: string | null
  type: string
}

type PreliminaryGroup = {
  name: string
  ruleIds: string[]
  reason: string
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

async function groupChunk(chunk: RuleForGrouping[], languageName: string): Promise<PreliminaryGroup[]> {
  const rulesText = chunk.map((r, i) =>
    `[${r.id}] ${r.title}${r.description ? ` — ${r.description}` : ''} (type: ${r.type})`
  ).join('\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are analyzing ${languageName} language learning rules. Group the following rules by semantic similarity — rules that overlap, duplicate, or cover the same concept should be grouped together. Return ONLY valid JSON array, no markdown:
[{ "name": "group name", "ruleIds": ["id1", "id2"], "reason": "why grouped" }]
Rules that don't clearly belong with others should be omitted (they will remain ungrouped).
A group must have at least 2 rules.`,
    messages: [{ role: 'user', content: rulesText }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    return []
  }
}

async function consolidateGroups(
  allGroups: PreliminaryGroup[],
  allRules: RuleForGrouping[],
  languageName: string
): Promise<PreliminaryGroup[]> {
  if (allGroups.length === 0) return []

  const groupsText = allGroups.map((g, i) =>
    `Group "${g.name}" (rules: ${g.ruleIds.join(', ')}): ${g.reason}`
  ).join('\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are consolidating preliminary ${languageName} rule groups that came from different batches. Merge groups that cover the same topic. Keep distinct groups separate. Return ONLY valid JSON array, no markdown:
[{ "name": "group name", "ruleIds": ["id1", "id2", ...], "reason": "why grouped" }]
Include all ruleIds from merged groups. Every ruleId must appear at most once across all groups.`,
    messages: [{ role: 'user', content: groupsText }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    const consolidated: PreliminaryGroup[] = JSON.parse(cleaned)
    // Validate: only keep ruleIds that actually exist
    const validIds = new Set(allRules.map(r => r.id))
    return consolidated
      .map(g => ({ ...g, ruleIds: g.ruleIds.filter(id => validIds.has(id)) }))
      .filter(g => g.ruleIds.length >= 2)
  } catch {
    return allGroups
  }
}

export async function runGrouping(
  rules: RuleForGrouping[],
  languageName: string
): Promise<PreliminaryGroup[]> {
  const CHUNK_SIZE = 30
  const chunks = chunkArray(rules, CHUNK_SIZE)

  // Map: group each chunk in parallel
  const chunkResults = await Promise.all(
    chunks.map(chunk => groupChunk(chunk, languageName))
  )
  const allPreliminary = chunkResults.flat()

  if (chunks.length === 1) {
    // Single chunk — no consolidation needed
    return allPreliminary.filter(g => g.ruleIds.length >= 2)
  }

  // Reduce: consolidate groups across chunks
  return consolidateGroups(allPreliminary, rules, languageName)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/optimize/grouping.ts
git commit -m "feat: add MapReduce grouping library for rule optimization"
```

---

## Task 4: Merging library

**Files:**
- Create: `lib/optimize/merging.ts`

- [ ] **Step 1: Create `lib/optimize/merging.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { RuleForGrouping } from './grouping'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type MergedRuleResult = {
  title: string
  description: string | null
  formula: string | null
  type: 'rule' | 'structure' | 'collocation'
  aiContext: string | null
  difficulty: number
  examples: string[]
}

export async function generateMergedRule(
  groupName: string,
  sourceRules: (RuleForGrouping & {
    formula: string | null
    aiContext: string | null
    difficulty: number
    examples: string[] | null
  })[],
  languageName: string
): Promise<MergedRuleResult> {
  const rulesText = sourceRules.map(r => {
    const parts = [`Title: ${r.title}`]
    if (r.description) parts.push(`Description: ${r.description}`)
    if (r.formula) parts.push(`Formula: ${r.formula}`)
    if (r.examples?.length) parts.push(`Examples: ${r.examples.join(' | ')}`)
    parts.push(`Type: ${r.type}, Difficulty: ${r.difficulty}`)
    return parts.join('\n')
  }).join('\n\n---\n\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are a ${languageName} language teacher. The following rules all relate to "${groupName}". Write ONE high-quality consolidated rule that captures all their key points without losing important details. Return ONLY valid JSON, no markdown:
{
  "title": "concise rule name",
  "description": "1-2 sentence explanation",
  "formula": "structural formula or null",
  "type": "rule|structure|collocation",
  "aiContext": "hints for exercise generation or null",
  "difficulty": 1-5,
  "examples": ["example 1", "example 2", "example 3"]
}
Type: rule=grammatical rule, structure=sentence pattern, collocation=fixed word combination.
Difficulty: 1=beginner to 5=advanced. If source rules have different difficulties, use the average.`,
    messages: [{ role: 'user', content: rulesText }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const result = JSON.parse(cleaned)

  return {
    title: result.title ?? 'Merged rule',
    description: result.description ?? null,
    formula: result.formula ?? null,
    type: ['rule', 'structure', 'collocation'].includes(result.type) ? result.type : 'rule',
    aiContext: result.aiContext ?? null,
    difficulty: typeof result.difficulty === 'number' ? Math.min(5, Math.max(1, result.difficulty)) : 3,
    examples: Array.isArray(result.examples) ? result.examples : [],
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/optimize/merging.ts
git commit -m "feat: add merged rule generation library for rule optimization"
```

---

## Task 5: POST /api/optimize/start

**Files:**
- Create: `app/api/optimize/start/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import {
  rules, languages, ruleStats,
  optimizationSessions, optimizationGroups
} from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { runGrouping } from '@/lib/optimize/grouping'
import { ruleCategoryLinks } from '@/lib/db/schema'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { languageId, filterCategoryId } = await request.json()
    if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 })

    const [lang] = await db
      .select({ name: languages.name })
      .from(languages)
      .where(and(eq(languages.id, languageId), eq(languages.userId, user.id)))
    if (!lang) return NextResponse.json({ error: 'Language not found' }, { status: 404 })

    // Fetch active (non-archived) rules for this language
    let rulesQuery = db
      .select({
        id: rules.id,
        title: rules.title,
        description: rules.description,
        formula: rules.formula,
        type: rules.type,
        aiContext: rules.aiContext,
        difficulty: rules.difficulty,
        examples: rules.examples,
      })
      .from(rules)
      .where(and(eq(rules.languageId, languageId), eq(rules.userId, user.id), eq(rules.archived, false)))

    let allRules = await rulesQuery

    // Apply category filter if provided
    if (filterCategoryId) {
      const linkedRuleIds = await db
        .select({ ruleId: ruleCategoryLinks.ruleId })
        .from(ruleCategoryLinks)
        .where(eq(ruleCategoryLinks.categoryId, filterCategoryId))
      const linkedIds = new Set(linkedRuleIds.map(r => r.ruleId))
      allRules = allRules.filter(r => linkedIds.has(r.id))
    }

    if (allRules.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 rules to optimize' }, { status: 400 })
    }

    // Create session
    const [session] = await db.insert(optimizationSessions).values({
      languageId,
      userId: user.id,
      status: 'grouping',
      filterCategoryId: filterCategoryId ?? null,
      sourceRuleIds: allRules.map(r => r.id),
    }).returning()

    // Run MapReduce grouping
    const groups = await runGrouping(
      allRules.map(r => ({ id: r.id, title: r.title, description: r.description, type: r.type })),
      lang.name
    )

    // Insert groups
    if (groups.length > 0) {
      await db.insert(optimizationGroups).values(
        groups.map(g => ({
          sessionId: session.id,
          name: g.name,
          sourceRuleIds: g.ruleIds,
        }))
      )
    }

    // Update session status
    await db.update(optimizationSessions)
      .set({ status: 'grouped' })
      .where(eq(optimizationSessions.id, session.id))

    return NextResponse.json({ sessionId: session.id })
  } catch (err) {
    console.error('[optimize/start]', err)
    return NextResponse.json({ error: 'Failed to start optimization' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/optimize/start/route.ts
git commit -m "feat: add POST /api/optimize/start — create session and run grouping"
```

---

## Task 6: GET /api/optimize/[sessionId]

**Files:**
- Create: `app/api/optimize/[sessionId]/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { optimizationSessions, optimizationGroups, rules } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params

  const [session] = await db
    .select()
    .from(optimizationSessions)
    .where(and(eq(optimizationSessions.id, sessionId), eq(optimizationSessions.userId, user.id)))
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const groups = await db
    .select()
    .from(optimizationGroups)
    .where(eq(optimizationGroups.sessionId, sessionId))

  // Fetch source rule details for the whole session
  const allRuleIds = [...new Set(groups.flatMap(g => g.sourceRuleIds))]
  const sourceRules = allRuleIds.length > 0
    ? await db
        .select({ id: rules.id, title: rules.title, type: rules.type, difficulty: rules.difficulty })
        .from(rules)
        .where(inArray(rules.id, allRuleIds))
    : []

  const rulesById = Object.fromEntries(sourceRules.map(r => [r.id, r]))

  return NextResponse.json({
    session,
    groups: groups.map(g => ({
      ...g,
      sourceRules: g.sourceRuleIds.map(id => rulesById[id]).filter(Boolean),
    })),
    ungroupedRules: sourceRules.filter(r =>
      !groups.some(g => g.sourceRuleIds.includes(r.id))
    ),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/optimize/[sessionId]/route.ts
git commit -m "feat: add GET /api/optimize/[sessionId] — session state and groups"
```

---

## Task 7: PATCH /api/optimize/[sessionId]/groups

**Files:**
- Create: `app/api/optimize/[sessionId]/groups/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { optimizationSessions, optimizationGroups } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params

  // Verify session ownership
  const [session] = await db
    .select()
    .from(optimizationSessions)
    .where(and(eq(optimizationSessions.id, sessionId), eq(optimizationSessions.userId, user.id)))
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const {
    groupId, name, sourceRuleIds, excluded,
    mergedTitle, mergedDescription, mergedFormula,
    mergedType, mergedAiContext, mergedDifficulty, mergedExamples,
  } = body

  if (!groupId) return NextResponse.json({ error: 'groupId required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (sourceRuleIds !== undefined) updates.sourceRuleIds = sourceRuleIds
  if (excluded !== undefined) updates.excluded = excluded
  if (mergedTitle !== undefined) updates.mergedTitle = mergedTitle
  if (mergedDescription !== undefined) updates.mergedDescription = mergedDescription
  if (mergedFormula !== undefined) updates.mergedFormula = mergedFormula
  if (mergedType !== undefined) updates.mergedType = mergedType
  if (mergedAiContext !== undefined) updates.mergedAiContext = mergedAiContext
  if (mergedDifficulty !== undefined) updates.mergedDifficulty = mergedDifficulty
  if (mergedExamples !== undefined) updates.mergedExamples = mergedExamples

  const [updated] = await db
    .update(optimizationGroups)
    .set(updates)
    .where(and(eq(optimizationGroups.id, groupId), eq(optimizationGroups.sessionId, sessionId)))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  return NextResponse.json(updated)
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/optimize/[sessionId]/groups/route.ts
git commit -m "feat: add PATCH /api/optimize/[sessionId]/groups — update group fields"
```

---

## Task 8: POST /api/optimize/[sessionId]/generate

**Files:**
- Create: `app/api/optimize/[sessionId]/generate/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { optimizationSessions, optimizationGroups, rules, languages } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { generateMergedRule } from '@/lib/optimize/merging'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sessionId } = await params

    const [session] = await db
      .select()
      .from(optimizationSessions)
      .where(and(eq(optimizationSessions.id, sessionId), eq(optimizationSessions.userId, user.id)))
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [lang] = await db
      .select({ name: languages.name })
      .from(languages)
      .where(eq(languages.id, session.languageId))

    const groups = await db
      .select()
      .from(optimizationGroups)
      .where(and(
        eq(optimizationGroups.sessionId, sessionId),
        eq(optimizationGroups.excluded, false),
      ))

    // Fetch all source rules needed
    const allRuleIds = [...new Set(groups.flatMap(g => g.sourceRuleIds))]
    const sourceRules = allRuleIds.length > 0
      ? await db
          .select({
            id: rules.id, title: rules.title, description: rules.description,
            formula: rules.formula, type: rules.type, aiContext: rules.aiContext,
            difficulty: rules.difficulty, examples: rules.examples,
          })
          .from(rules)
          .where(inArray(rules.id, allRuleIds))
      : []
    const rulesById = Object.fromEntries(sourceRules.map(r => [r.id, r]))

    // Generate merged rule for each group in parallel
    await db.update(optimizationSessions)
      .set({ status: 'generating' })
      .where(eq(optimizationSessions.id, sessionId))

    await Promise.all(groups.map(async (group) => {
      try {
        await db.update(optimizationGroups)
          .set({ generationStatus: 'generating' })
          .where(eq(optimizationGroups.id, group.id))

        const groupRules = group.sourceRuleIds
          .map(id => rulesById[id])
          .filter(Boolean) as typeof sourceRules

        const merged = await generateMergedRule(group.name, groupRules, lang?.name ?? 'Unknown')

        await db.update(optimizationGroups).set({
          mergedTitle: merged.title,
          mergedDescription: merged.description,
          mergedFormula: merged.formula,
          mergedType: merged.type,
          mergedAiContext: merged.aiContext,
          mergedDifficulty: merged.difficulty,
          mergedExamples: merged.examples,
          generationStatus: 'done',
        }).where(eq(optimizationGroups.id, group.id))
      } catch {
        await db.update(optimizationGroups)
          .set({ generationStatus: 'error' })
          .where(eq(optimizationGroups.id, group.id))
      }
    }))

    await db.update(optimizationSessions)
      .set({ status: 'ready' })
      .where(eq(optimizationSessions.id, sessionId))

    // Return updated groups
    const updatedGroups = await db
      .select()
      .from(optimizationGroups)
      .where(eq(optimizationGroups.sessionId, sessionId))

    return NextResponse.json({ groups: updatedGroups })
  } catch (err) {
    console.error('[optimize/generate]', err)
    return NextResponse.json({ error: 'Failed to generate' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/optimize/[sessionId]/generate/route.ts
git commit -m "feat: add POST /api/optimize/[sessionId]/generate — parallel rule generation"
```

---

## Task 9: POST /api/optimize/[sessionId]/apply

**Files:**
- Create: `app/api/optimize/[sessionId]/apply/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import {
  optimizationSessions, optimizationGroups,
  rules, ruleStats, ruleCategoryLinks
} from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sessionId } = await params

    const [session] = await db
      .select()
      .from(optimizationSessions)
      .where(and(eq(optimizationSessions.id, sessionId), eq(optimizationSessions.userId, user.id)))
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (session.status === 'applied') return NextResponse.json({ error: 'Already applied' }, { status: 400 })

    const groups = await db
      .select()
      .from(optimizationGroups)
      .where(and(
        eq(optimizationGroups.sessionId, sessionId),
        eq(optimizationGroups.excluded, false),
      ))

    const activeGroups = groups.filter(g => g.mergedTitle)
    if (activeGroups.length === 0) return NextResponse.json({ error: 'No groups to apply' }, { status: 400 })

    const allSourceIds = [...new Set(activeGroups.flatMap(g => g.sourceRuleIds))]

    // Fetch source stats and category links
    const [sourceStatsRows, sourceCategoryLinks] = await Promise.all([
      db.select().from(ruleStats).where(inArray(ruleStats.ruleId, allSourceIds)),
      db.select().from(ruleCategoryLinks).where(inArray(ruleCategoryLinks.ruleId, allSourceIds)),
    ])

    const statsById = Object.fromEntries(sourceStatsRows.map(s => [s.ruleId, s]))
    const categoryLinksByRuleId: Record<string, string[]> = {}
    for (const link of sourceCategoryLinks) {
      categoryLinksByRuleId[link.ruleId] = [...(categoryLinksByRuleId[link.ruleId] ?? []), link.categoryId]
    }

    // Apply in a transaction
    await db.transaction(async (tx) => {
      for (const group of activeGroups) {
        // Compute averaged stats from source rules
        const groupStats = group.sourceRuleIds.map(id => statsById[id]).filter(Boolean)
        const count = groupStats.length || 1
        const avgEmaScore = groupStats.reduce((s, r) => s + r.emaScore, 0) / count
        const avgEaseFactor = groupStats.reduce((s, r) => s + r.easeFactor, 0) / count
        const minInterval = Math.min(...groupStats.map(r => r.interval), 1)
        const avgRepetitions = Math.round(groupStats.reduce((s, r) => s + r.repetitions, 0) / count)
        const anyWeak = groupStats.some(r => r.weakFlag)

        // Union of all category IDs from source rules
        const allCategoryIds = [...new Set(group.sourceRuleIds.flatMap(id => categoryLinksByRuleId[id] ?? []))]

        // Create merged rule
        const [newRule] = await tx.insert(rules).values({
          languageId: session.languageId,
          userId: user.id,
          title: group.mergedTitle!,
          description: group.mergedDescription ?? null,
          formula: group.mergedFormula ?? null,
          type: (group.mergedType as 'rule' | 'structure' | 'collocation') ?? 'rule',
          aiContext: group.mergedAiContext ?? null,
          difficulty: group.mergedDifficulty ?? 3,
          examples: group.mergedExamples ?? [],
          archived: false,
        }).returning()

        // Create ruleStats with inherited progress
        await tx.insert(ruleStats).values({
          ruleId: newRule.id,
          userId: user.id,
          emaScore: avgEmaScore,
          attemptsTotal: 0,
          weakFlag: anyWeak,
          interval: minInterval,
          repetitions: avgRepetitions,
          easeFactor: avgEaseFactor,
        })

        // Create category links for merged rule
        if (allCategoryIds.length > 0) {
          await tx.insert(ruleCategoryLinks).values(
            allCategoryIds.map(categoryId => ({ ruleId: newRule.id, categoryId }))
          )
        }

        // Archive source rules
        await tx.update(rules)
          .set({ archived: true })
          .where(inArray(rules.id, group.sourceRuleIds))
      }

      // Mark session applied
      await tx.update(optimizationSessions)
        .set({ status: 'applied', appliedAt: new Date() })
        .where(eq(optimizationSessions.id, sessionId))
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[optimize/apply]', err)
    return NextResponse.json({ error: 'Failed to apply optimization' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/optimize/[sessionId]/apply/route.ts
git commit -m "feat: add POST /api/optimize/[sessionId]/apply — transactional apply with progress inheritance"
```

---

## Task 10: Optimize page UI

**Files:**
- Create: `app/(dashboard)/languages/[id]/optimize/page.tsx`

- [ ] **Step 1: Create the optimize page**

```typescript
'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Phase = 'setup' | 'analyzing' | 'review' | 'generating' | 'applying' | 'done'

type SourceRule = { id: string; title: string; type: string; difficulty: number }

type Group = {
  id: string
  name: string
  sourceRuleIds: string[]
  sourceRules: SourceRule[]
  excluded: boolean
  mergedTitle: string | null
  mergedDescription: string | null
  mergedFormula: string | null
  mergedType: string | null
  mergedAiContext: string | null
  mergedDifficulty: number | null
  mergedExamples: string[] | null
  generationStatus: string
}

type Category = { id: string; name: string }

const textareaClass = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y transition-colors"

export default function OptimizePage() {
  const { id: languageId } = useParams<{ id: string }>()
  const router = useRouter()

  const [phase, setPhase] = useState<Phase>('setup')
  const [categories, setCategories] = useState<Category[]>([])
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [ungroupedRules, setUngroupedRules] = useState<SourceRule[]>([])
  const [error, setError] = useState('')
  const [ruleCount, setRuleCount] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/rules/categories?languageId=${languageId}`).then(r => r.json()),
      fetch(`/api/rules?languageId=${languageId}`).then(r => r.json()),
    ]).then(([cats, rulesData]) => {
      setCategories(cats)
      setRuleCount(rulesData.length)
    })
  }, [languageId])

  async function handleAnalyze() {
    setError('')
    setPhase('analyzing')
    const res = await fetch('/api/optimize/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languageId, filterCategoryId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Analysis failed')
      setPhase('setup')
      return
    }
    const { sessionId: sid } = await res.json()
    setSessionId(sid)

    const sessionRes = await fetch(`/api/optimize/${sid}`)
    const sessionData = await sessionRes.json()
    setGroups(sessionData.groups)
    setUngroupedRules(sessionData.ungroupedRules)
    setPhase('review')
  }

  async function handleGenerate() {
    if (!sessionId) return
    setError('')
    setPhase('generating')

    // Sync local group edits to server before generating
    await Promise.all(
      groups.map(g =>
        fetch(`/api/optimize/${sessionId}/groups`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupId: g.id,
            name: g.name,
            sourceRuleIds: g.sourceRuleIds,
            excluded: g.excluded,
          }),
        })
      )
    )

    const res = await fetch(`/api/optimize/${sessionId}/generate`, { method: 'POST' })
    if (!res.ok) {
      setError('Generation failed')
      setPhase('review')
      return
    }
    const { groups: updatedGroups } = await res.json()

    // Re-fetch to get sourceRules attached
    const sessionRes = await fetch(`/api/optimize/${sessionId}`)
    const sessionData = await sessionRes.json()
    setGroups(sessionData.groups)
    setPhase('review')
  }

  async function handleApply() {
    if (!sessionId) return
    setError('')
    setPhase('applying')

    // Sync merged rule edits
    await Promise.all(
      groups
        .filter(g => !g.excluded && g.mergedTitle)
        .map(g =>
          fetch(`/api/optimize/${sessionId}/groups`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groupId: g.id,
              mergedTitle: g.mergedTitle,
              mergedDescription: g.mergedDescription,
              mergedFormula: g.mergedFormula,
              mergedType: g.mergedType,
              mergedAiContext: g.mergedAiContext,
              mergedDifficulty: g.mergedDifficulty,
              mergedExamples: g.mergedExamples,
            }),
          })
        )
    )

    const res = await fetch(`/api/optimize/${sessionId}/apply`, { method: 'POST' })
    if (!res.ok) {
      setError('Apply failed')
      setPhase('review')
      return
    }
    router.push(`/languages/${languageId}/rules`)
  }

  function updateGroup(id: string, patch: Partial<Group>) {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g))
  }

  function removeRuleFromGroup(groupId: string, ruleId: string) {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    const removedRule = group.sourceRules.find(r => r.id === ruleId)
    if (removedRule) setUngroupedRules(prev => [...prev, removedRule])
    updateGroup(groupId, {
      sourceRuleIds: group.sourceRuleIds.filter(id => id !== ruleId),
      sourceRules: group.sourceRules.filter(r => r.id !== ruleId),
    })
  }

  const hasGenerated = groups.some(g => !g.excluded && g.generationStatus === 'done')
  const activeGroupCount = groups.filter(g => !g.excluded).length
  const archivedRuleCount = groups.filter(g => !g.excluded).flatMap(g => g.sourceRuleIds).length

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Rules / Optimize</p>
          <h1 className="text-xl font-semibold">Optimize rules</h1>
        </div>
        <Button variant="outline" onClick={() => router.push(`/languages/${languageId}/rules`)}>
          Cancel
        </Button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
      )}

      {/* Setup phase */}
      {phase === 'setup' && (
        <Card>
          <CardContent className="py-6 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              AI will semantically group similar rules and generate one consolidated rule per group.
              Original rules will be archived.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Rules to analyze</label>
              <select
                value={filterCategoryId ?? ''}
                onChange={e => setFilterCategoryId(e.target.value || null)}
                className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none"
              >
                <option value="">All rules {ruleCount !== null ? `(${ruleCount})` : ''}</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <Button onClick={handleAnalyze}>Analyze</Button>
          </CardContent>
        </Card>
      )}

      {/* Analyzing spinner */}
      {phase === 'analyzing' && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium mb-1">Grouping rules...</p>
            <p className="text-xs text-muted-foreground">AI is finding semantic groups. This takes ~10 seconds.</p>
          </CardContent>
        </Card>
      )}

      {/* Generating spinner */}
      {phase === 'generating' && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium mb-1">Generating merged rules...</p>
            <p className="text-xs text-muted-foreground">Creating one rule per group. This takes ~{activeGroupCount * 3} seconds.</p>
          </CardContent>
        </Card>
      )}

      {/* Applying spinner */}
      {phase === 'applying' && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Applying optimization...</p>
          </CardContent>
        </Card>
      )}

      {/* Review phase */}
      {phase === 'review' && (
        <div className="flex flex-col gap-4">
          {/* Summary */}
          <p className="text-sm text-muted-foreground">
            Found {groups.length} groups. {ungroupedRules.length > 0 && `${ungroupedRules.length} rules are ungrouped and won't be changed.`}
          </p>

          {/* Groups */}
          {groups.map(group => (
            <Card key={group.id} className={group.excluded ? 'opacity-50' : ''}>
              <CardContent className="py-4 flex flex-col gap-3">
                {/* Group header */}
                <div className="flex items-start justify-between gap-2">
                  <input
                    value={group.name}
                    onChange={e => updateGroup(group.id, { name: e.target.value })}
                    className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent hover:border-border focus:border-ring"
                  />
                  <button
                    type="button"
                    onClick={() => updateGroup(group.id, { excluded: !group.excluded })}
                    className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
                  >
                    {group.excluded ? 'Include' : 'Exclude'}
                  </button>
                </div>

                {/* Source rules */}
                <div className="flex flex-wrap gap-1.5">
                  {group.sourceRules.map(rule => (
                    <span key={rule.id} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md">
                      {rule.title}
                      <button
                        type="button"
                        onClick={() => removeRuleFromGroup(group.id, rule.id)}
                        className="text-muted-foreground hover:text-destructive leading-none"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>

                {/* Merged rule (shown after generation) */}
                {group.generationStatus === 'done' && group.mergedTitle && (
                  <div className="flex flex-col gap-2 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Merged rule</p>
                    <input
                      value={group.mergedTitle}
                      onChange={e => updateGroup(group.id, { mergedTitle: e.target.value })}
                      className="text-sm font-medium bg-transparent outline-none border-b border-transparent hover:border-border focus:border-ring"
                      placeholder="Title"
                    />
                    <textarea
                      value={group.mergedDescription ?? ''}
                      onChange={e => updateGroup(group.id, { mergedDescription: e.target.value || null })}
                      placeholder="Description"
                      rows={2}
                      className={textareaClass}
                    />
                    {group.mergedFormula && (
                      <input
                        value={group.mergedFormula}
                        onChange={e => updateGroup(group.id, { mergedFormula: e.target.value || null })}
                        className="text-sm font-mono bg-muted rounded px-2 py-1 outline-none"
                        placeholder="Formula"
                      />
                    )}
                  </div>
                )}

                {group.generationStatus === 'error' && (
                  <p className="text-xs text-destructive">Generation failed for this group.</p>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Ungrouped rules */}
          {ungroupedRules.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ungrouped — will not be changed
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ungroupedRules.map(r => (
                  <span key={r.id} className="text-xs bg-muted px-2 py-0.5 rounded-md text-muted-foreground">{r.title}</span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {!hasGenerated ? (
              <Button onClick={handleGenerate} className="flex-1" disabled={groups.every(g => g.excluded)}>
                Generate merged rules
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleGenerate} className="flex-1">
                  Regenerate
                </Button>
                <Button onClick={handleApply} className="flex-1">
                  Apply — {activeGroupCount} groups, {archivedRuleCount} rules archived
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(dashboard)/languages/[id]/optimize/page.tsx
git commit -m "feat: add AI rule optimization page with full review/edit/apply flow"
```

---

## Task 11: Add "Optimize rules" button to rules page

**Files:**
- Modify: `app/(dashboard)/languages/[id]/rules/page.tsx`

- [ ] **Step 1: Add Link import and Optimize button**

Add `Link` import at the top of `app/(dashboard)/languages/[id]/rules/page.tsx`:

```typescript
import Link from 'next/link'
```

Change the header div (around line 205):
```typescript
// Before:
<div className="flex items-center justify-between mb-6">
  <div>
    <p className="text-xs text-muted-foreground mb-0.5">Overview / Rules</p>
    <h1 className="text-xl font-semibold">Rules</h1>
  </div>
  <Button onClick={() => { resetForm(); setShowModal(true) }}>
    + Add
  </Button>
</div>

// After:
<div className="flex items-center justify-between mb-6">
  <div>
    <p className="text-xs text-muted-foreground mb-0.5">Overview / Rules</p>
    <h1 className="text-xl font-semibold">Rules</h1>
  </div>
  <div className="flex items-center gap-2">
    <Link href={`/languages/${languageId}/optimize`}>
      <Button variant="outline">Optimize rules</Button>
    </Link>
    <Button onClick={() => { resetForm(); setShowModal(true) }}>
      + Add
    </Button>
  </div>
</div>
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "story_translate\|history/\[id\]"
```

Expected: no output (no errors from our changes).

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/languages/[id]/rules/page.tsx
git commit -m "feat: add Optimize rules button to rules page"
```

---

## Task 12: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Smoke test checklist**

1. Open a language's rules page — "Optimize rules" button is visible
2. Click it → lands on `/languages/[id]/optimize`
3. Select filter (all or category) → click Analyze
4. Groups appear with source rule chips
5. Rename a group, exclude a group, remove a rule from a group
6. Click "Generate merged rules" → spinner → merged rules appear under each group
7. Edit a merged rule title/description
8. Click "Apply" → redirected to rules page
9. New merged rules appear, old rules are gone from list
10. Practice page still works (archived rules excluded from selection)