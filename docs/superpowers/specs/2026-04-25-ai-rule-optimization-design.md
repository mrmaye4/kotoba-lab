# Design: AI Rule Optimization

**Date:** 2026-04-25  
**Status:** Approved

## Problem

Users accumulate many rules over time. Rules may overlap, duplicate, or fragment a single concept across multiple entries. This feature lets AI group and merge them into cleaner, consolidated rules — while preserving learning progress.

## Out of Scope (deferred)

- Undo/rollback after applying optimization

---

## 1. Database Schema

### Modified table: `rules`

Add `archived` column:
```typescript
archived: boolean('archived').notNull().default(false)
```

Archived rules are excluded from all normal queries (rules page, practice page, daily practice). They are retained for history/progress lineage.

### New table: `optimization_sessions`

```typescript
export const optimizationSessions = pgTable('optimization_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  languageId: uuid('language_id').notNull(),
  userId: uuid('user_id').notNull(),
  status: text('status').notNull().default('pending'),
  // 'pending' | 'grouping' | 'grouped' | 'generating' | 'ready' | 'applied'
  filterCategoryId: uuid('filter_category_id'),  // null = all rules
  sourceRuleIds: uuid('source_rule_ids').array().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  appliedAt: timestamp('applied_at'),
})
```

### New table: `optimization_groups`

```typescript
export const optimizationGroups = pgTable('optimization_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => optimizationSessions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),               // Claude-generated group name, editable
  sourceRuleIds: uuid('source_rule_ids').array().notNull(),
  excluded: boolean('excluded').notNull().default(false),
  // Generated merged rule fields (null until generation runs)
  mergedTitle: text('merged_title'),
  mergedDescription: text('merged_description'),
  mergedFormula: text('merged_formula'),
  mergedType: text('merged_type'),            // 'rule' | 'structure' | 'collocation'
  mergedAiContext: text('merged_ai_context'),
  mergedDifficulty: integer('merged_difficulty'),
  mergedExamples: jsonb('merged_examples').$type<string[]>(),
  generationStatus: text('generation_status').notNull().default('pending'),
  // 'pending' | 'generating' | 'done' | 'error'
})
```

---

## 2. AI Pipeline

### Step 1: Grouping (MapReduce)

**Input:** N rules (filtered by category or all)

**Map phase (parallel):**
- Split rules into chunks of 30
- Each chunk → one Claude call
- Prompt: "Group these rules by semantic similarity. Return JSON: `[{ name, ruleIds, reason }]`"
- Runs in parallel via `Promise.all`

**Reduce phase (single call):**
- Send all preliminary group names + descriptions to Claude
- Prompt: "Consolidate these groups from different batches. Merge groups that cover the same topic."
- Returns final consolidated groups with merged `ruleIds`

**Output:** `optimizationGroups` rows created with `generationStatus: 'pending'`

Session status: `'grouping'` → `'grouped'`

### Step 2: Generating merged rules (parallel, per group)

Triggered by user clicking **"Generate merged rules"** after reviewing groups.

- One Claude call per non-excluded group, all in `Promise.all`
- Prompt per group: "Here are N rules about [topic]. Write one consolidated rule that captures all of them. Return JSON: `{ title, description, formula, type, aiContext, difficulty, examples }`"
- Results stream into `optimizationGroups` as each resolves

Session status: `'generating'` → `'ready'`

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `POST /api/optimize/start` | POST | Create session, run grouping |
| `GET /api/optimize/[sessionId]` | GET | Get session + groups state |
| `PATCH /api/optimize/[sessionId]/groups` | PATCH | Edit group (name, sourceRuleIds, excluded, merged fields) |
| `POST /api/optimize/[sessionId]/generate` | POST | Generate merged rules for all groups |
| `POST /api/optimize/[sessionId]/apply` | POST | Apply optimization, archive old rules |

---

## 3. UI/UX Flow

**Entry point:** Button "Optimize rules" on the language rules page → navigates to `/languages/[id]/optimize`

### Phase 1 — Launch

- Filter selector: "All rules (N)" or pick a category
- Shows rule count that will be analyzed
- Button "Analyze" → triggers grouping → shows spinner "Grouping rules..."
- On completion: groups appear with source rules listed inside each group

### Phase 2 — Review groups

Each group card shows:
- Group name (editable inline)
- Source rules as chips (click ✕ to remove from group; removed rules go to "Ungrouped")
- "Exclude group" toggle — group is skipped during apply
- Ungrouped rules section at the bottom (rules not in any group, untouched)

User edits groups as needed, then clicks **"Generate merged rules"**.

### Phase 3 — Generation

- Each group card shows spinner while generating
- Merged rule appears under the group as soon as its generation completes (progressive reveal)
- Merged rule fields are fully editable inline (title, description, formula, type, difficulty, examples, aiContext)

### Phase 4 — Apply

- Summary banner: "X groups → X new rules, Y source rules → archived, Z rules unchanged"
- Button **"Apply optimization"**
- On success: redirect to rules page

---

## 4. Save Logic (Apply)

For each non-excluded group with a generated merged rule:

1. **Create new rule** with merged fields + `languageId`, `userId`
2. **Categories** = union of all unique `categoryIds` from source rules (via `ruleCategoryLinks`)
3. **Create ruleStats** for new rule:
   - `emaScore` = average of source rules' `emaScore`
   - `easeFactor` = average of source rules' `easeFactor`
   - `interval` = min of source rules' `interval`
   - `repetitions` = Math.round(average of source rules' `repetitions`)
   - `weakFlag` = true if any source rule had `weakFlag = true`
   - `nextReview` = now (start fresh review cycle)
4. **Archive source rules**: set `archived = true` on all `sourceRuleIds` of the group
5. **Rules outside all groups**: untouched

Session status → `'applied'`, `appliedAt` = now

All operations in a single DB transaction.

---

## 5. Filtering Archived Rules

All existing queries that fetch rules must add `eq(rules.archived, false)` (or `isNull`) to their WHERE clause:

- `GET /api/rules` 
- `GET /api/generate`
- Daily practice rule selection
- Any other rule queries

---

## 6. Page Structure

```
app/(dashboard)/languages/[id]/optimize/
  page.tsx          — main optimize page (phases 1-4)
app/api/optimize/
  start/route.ts    — POST: create session + run grouping
  [sessionId]/
    route.ts        — GET: session + groups
    groups/route.ts — PATCH: edit group
    generate/route.ts — POST: generate merged rules
    apply/route.ts  — POST: apply optimization
```

---

## 7. Claude Prompts (summary)

**Grouping (map):**
> You are analyzing language learning rules. Group the following rules by semantic similarity — rules that overlap, duplicate, or cover the same concept. Return JSON array: `[{ "name": "group name", "ruleIds": [...], "reason": "why grouped" }]`. Rules that don't fit any group should be omitted.

**Grouping (reduce/consolidate):**
> These groups came from different batches. Consolidate them: merge groups that cover the same topic, keep distinct groups separate. Return same JSON format with updated ruleIds.

**Merge rule generation:**
> You are a language teacher. The following rules all relate to [group name]. Write one high-quality consolidated rule that captures all their key points without losing important details. Return JSON: `{ "title", "description", "formula", "type", "aiContext", "difficulty", "examples" }`.