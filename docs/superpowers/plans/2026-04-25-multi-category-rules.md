# Multi-Category Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow rules to be assigned multiple categories instead of one, using a many-to-many join table.

**Architecture:** Add a `rule_category_links` join table, migrate existing `categoryId` data into it, remove the `categoryId` column from `rules`, then update API and UI to work with `categoryIds: string[]` per rule.

**Tech Stack:** Next.js App Router, Drizzle ORM v0.45 (postgres-js), Supabase, React, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `lib/db/schema.ts` | Add `ruleCategoryLinks` table; remove `categoryId` from `rules` |
| `types/index.ts` | `RuleWithStats.categoryId` → `categoryIds: string[]` |
| `app/api/rules/route.ts` | GET returns `categoryIds[]`; POST/PATCH accept `categoryIds[]` |
| `app/(dashboard)/languages/_components/RulesPanel.tsx` | Multi-select `CategoryInput`, form state, filter logic, card display |
| `app/(dashboard)/practice/page.tsx` | Filter logic `r.categoryId` → `r.categoryIds.includes(...)` |

---

## Task 1: Add join table to schema (keep `categoryId` temporarily)

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Add `primaryKey` import and `ruleCategoryLinks` table to schema**

In `lib/db/schema.ts`, add `primaryKey` to the imports and append the new table after `ruleCategories`. Keep `categoryId` on `rules` for now.

```typescript
// Change the import at line 1 to include primaryKey:
import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  pgEnum,
  unique,
  primaryKey,
} from 'drizzle-orm/pg-core'
```

After the `ruleCategories` table definition (after line 44), add:

```typescript
// Rule ↔ category many-to-many
export const ruleCategoryLinks = pgTable('rule_category_links', {
  ruleId: uuid('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => ruleCategories.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.ruleId, t.categoryId] })])
```

- [ ] **Step 2: Push schema to create the join table**

```bash
npm run db:push
```

Expected: Drizzle detects the new table `rule_category_links` and asks to confirm creation. Confirm. No data loss — `rules.category_id` is still present.

---

## Task 2: Migrate existing data

**Files:** none (SQL run directly against Supabase)

- [ ] **Step 1: Copy existing `category_id` values into the join table**

Run this SQL in the Supabase SQL editor (Dashboard → SQL Editor):

```sql
INSERT INTO rule_category_links (rule_id, category_id)
SELECT id, category_id
FROM rules
WHERE category_id IS NOT NULL;
```

Expected: rows inserted equal to the number of rules that had a category assigned.

- [ ] **Step 2: Verify migration**

```sql
SELECT COUNT(*) FROM rule_category_links;
SELECT COUNT(*) FROM rules WHERE category_id IS NOT NULL;
```

Both counts must match.

---

## Task 3: Remove `categoryId` from `rules` schema

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Delete `categoryId` line from the `rules` table definition**

Remove line 51 from `lib/db/schema.ts`:
```typescript
categoryId: uuid('category_id'),
```

- [ ] **Step 2: Push schema to drop the column**

```bash
npm run db:push
```

Expected: Drizzle detects `category_id` column was removed and asks to confirm the drop. Confirm. Data is safe in `rule_category_links`.

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: add rule_category_links join table, migrate and drop rules.category_id"
```

---

## Task 4: Update TypeScript types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Replace `categoryId` with `categoryIds` in `RuleWithStats`**

In `types/index.ts`, change lines 27-28 from:
```typescript
export type RuleWithStats = {
  id: string
  categoryId?: string | null
```
to:
```typescript
export type RuleWithStats = {
  id: string
  categoryIds: string[]
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: update RuleWithStats type to use categoryIds array"
```

---

## Task 5: Update GET /api/rules

**Files:**
- Modify: `app/api/rules/route.ts`

- [ ] **Step 1: Rewrite GET to return `categoryIds` per rule using two queries + merge**

Replace the entire file content with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { rules, ruleStats, ruleCategoryLinks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const languageId = request.nextUrl.searchParams.get('languageId')
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 })

  const [rulesRows, linkRows] = await Promise.all([
    db
      .select({
        id: rules.id,
        title: rules.title,
        description: rules.description,
        formula: rules.formula,
        type: rules.type,
        aiContext: rules.aiContext,
        difficulty: rules.difficulty,
        examples: rules.examples,
        createdAt: rules.createdAt,
        emaScore: ruleStats.emaScore,
        weakFlag: ruleStats.weakFlag,
        nextReview: ruleStats.nextReview,
      })
      .from(rules)
      .leftJoin(ruleStats, eq(rules.id, ruleStats.ruleId))
      .where(and(eq(rules.languageId, languageId), eq(rules.userId, user.id))),

    db
      .select({ ruleId: ruleCategoryLinks.ruleId, categoryId: ruleCategoryLinks.categoryId })
      .from(ruleCategoryLinks)
      .innerJoin(rules, eq(ruleCategoryLinks.ruleId, rules.id))
      .where(and(eq(rules.languageId, languageId), eq(rules.userId, user.id))),
  ])

  const categoryMap = new Map<string, string[]>()
  for (const link of linkRows) {
    const arr = categoryMap.get(link.ruleId) ?? []
    arr.push(link.categoryId)
    categoryMap.set(link.ruleId, arr)
  }

  const result = rulesRows.map(r => ({
    ...r,
    categoryIds: categoryMap.get(r.id) ?? [],
  }))

  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { languageId, categoryIds, title, description, formula, type, aiContext, difficulty, examples } = body

  if (!languageId || !title?.trim()) {
    return NextResponse.json({ error: 'languageId and title are required' }, { status: 400 })
  }

  const [rule] = await db
    .insert(rules)
    .values({
      languageId,
      userId: user.id,
      title: title.trim(),
      description: description || null,
      formula: formula || null,
      type: type || 'rule',
      aiContext: aiContext || null,
      difficulty: difficulty ?? 3,
      examples: examples || [],
    })
    .returning()

  await db.insert(ruleStats).values({
    ruleId: rule.id,
    userId: user.id,
    emaScore: 0.5,
    attemptsTotal: 0,
    weakFlag: false,
  })

  if (Array.isArray(categoryIds) && categoryIds.length > 0) {
    await db.insert(ruleCategoryLinks).values(
      categoryIds.map((categoryId: string) => ({ ruleId: rule.id, categoryId }))
    )
  }

  return NextResponse.json(rule, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, categoryIds, title, description, formula, type, aiContext, difficulty, examples } = body

  if (!id || !title?.trim()) {
    return NextResponse.json({ error: 'id and title are required' }, { status: 400 })
  }

  const [rule] = await db
    .update(rules)
    .set({
      title: title.trim(),
      description: description || null,
      formula: formula || null,
      type: type || 'rule',
      aiContext: aiContext || null,
      difficulty: difficulty ?? 3,
      examples: examples || [],
    })
    .where(and(eq(rules.id, id), eq(rules.userId, user.id)))
    .returning()

  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.delete(ruleCategoryLinks).where(eq(ruleCategoryLinks.ruleId, id))
  if (Array.isArray(categoryIds) && categoryIds.length > 0) {
    await db.insert(ruleCategoryLinks).values(
      categoryIds.map((categoryId: string) => ({ ruleId: id, categoryId }))
    )
  }

  return NextResponse.json(rule)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.delete(rules).where(and(eq(rules.id, id), eq(rules.userId, user.id)))

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/rules/route.ts
git commit -m "feat: update rules API to use categoryIds array via join table"
```

---

## Task 6: Update RulesPanel — types, state, form

**Files:**
- Modify: `app/(dashboard)/languages/_components/RulesPanel.tsx`

- [ ] **Step 1: Update local `Rule` type**

Change the `Rule` type (lines 20-32) from:
```typescript
type Rule = {
  id: string
  categoryId: string | null
  title: string
  ...
}
```
to:
```typescript
type Rule = {
  id: string
  categoryIds: string[]
  title: string
  description: string | null
  formula: string | null
  type: RuleType
  aiContext: string | null
  difficulty: number
  examples: string[]
  emaScore: number | null
  weakFlag: boolean | null
}
```

- [ ] **Step 2: Replace `CategoryInput` with multi-select version**

Replace the entire `CategoryInput` function (lines 49-118) with:

```typescript
function CategoryInput({
  categories,
  values,
  onChange,
}: {
  categories: Category[]
  values: string[]
  onChange: (names: string[]) => void
}) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = input.trim()
    ? categories.filter(c =>
        c.name.toLowerCase().includes(input.toLowerCase()) &&
        !values.includes(c.name)
      )
    : categories.filter(c => !values.includes(c.name))

  const exactMatch = categories.some(c => c.name.toLowerCase() === input.trim().toLowerCase())
  const alreadySelected = values.some(v => v.toLowerCase() === input.trim().toLowerCase())

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function add(name: string) {
    if (!values.includes(name)) onChange([...values, name])
    setInput('')
    setOpen(false)
  }

  function remove(name: string) {
    onChange(values.filter(v => v !== name))
  }

  return (
    <div ref={ref} className="relative">
      <div
        className="flex flex-wrap gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 min-h-[38px] cursor-text"
        onClick={() => { setOpen(true) }}
      >
        {values.map(name => (
          <span key={name} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md">
            {name}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); remove(name) }}
              className="text-muted-foreground hover:text-foreground leading-none"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={values.length === 0 ? 'Type or pick a category…' : ''}
          autoComplete="off"
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && (filtered.length > 0 || (input.trim() && !exactMatch && !alreadySelected)) && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-md overflow-hidden">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              onMouseDown={e => { e.preventDefault(); add(c.name) }}
            >
              {c.name}
            </button>
          ))}
          {input.trim() && !exactMatch && !alreadySelected && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted transition-colors border-t border-border"
              onMouseDown={e => { e.preventDefault(); add(input.trim()) }}
            >
              Create <span className="font-medium">"{input.trim()}"</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update form state — replace `categoryName` with `categoryNames`**

In the component state declarations (around line 153), change:
```typescript
const [categoryName, setCategoryName] = useState('')  // typed name, may be new or existing
```
to:
```typescript
const [categoryNames, setCategoryNames] = useState<string[]>([])
```

- [ ] **Step 4: Update `resetForm`**

Change:
```typescript
setCategoryName(''); setSaveError(''); setHint(''); setSuggestError('')
```
to:
```typescript
setCategoryNames([]); setSaveError(''); setHint(''); setSuggestError('')
```

- [ ] **Step 5: Update `openEdit`**

Change:
```typescript
setCategoryName(categories.find(c => c.id === rule.categoryId)?.name ?? '')
```
to:
```typescript
setCategoryNames(
  rule.categoryIds
    .map(id => categories.find(c => c.id === id)?.name)
    .filter((n): n is string => Boolean(n))
)
```

- [ ] **Step 6: Update `handleSubmit` — resolve array of names to IDs**

Replace the category-resolution block in `handleSubmit` (the section starting `// Resolve or create category`, approximately lines 229-248) with:

```typescript
// Resolve or create categories
const resolvedCategoryIds: string[] = []
for (const name of categoryNames) {
  const trimmed = name.trim()
  if (!trimmed) continue
  const existing = categories.find(c => c.name.toLowerCase() === trimmed.toLowerCase())
  if (existing) {
    resolvedCategoryIds.push(existing.id)
  } else {
    const res = await fetch('/api/rules/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languageId, name: trimmed }),
    })
    if (res.ok) {
      const cat = await res.json()
      setCategories(prev => [...prev, cat])
      resolvedCategoryIds.push(cat.id)
    }
  }
}
```

- [ ] **Step 7: Update payload and optimistic updates**

Change the payload block (approximately lines 250-260) from:
```typescript
const payload = {
  languageId,
  categoryId: resolvedCategoryId,
  ...
}
```
to:
```typescript
const payload = {
  languageId,
  categoryIds: resolvedCategoryIds,
  title,
  description: description || null,
  formula: formula || null,
  type,
  aiContext: aiContext || null,
  difficulty,
  examples: examples ? examples.split('\n').map(s => s.trim()).filter(Boolean) : [],
}
```

Change the PATCH optimistic update (inside `if (editingId)`) from:
```typescript
setRules(prev => prev.map(r => r.id === editingId ? { ...r, ...updated } : r))
```
to:
```typescript
setRules(prev => prev.map(r => r.id === editingId ? { ...r, ...updated, categoryIds: resolvedCategoryIds } : r))
```

Change the POST optimistic update from:
```typescript
setRules(prev => [{ ...rule, emaScore: 0.5, weakFlag: false }, ...prev])
```
to:
```typescript
setRules(prev => [{ ...rule, categoryIds: resolvedCategoryIds, emaScore: 0.5, weakFlag: false }, ...prev])
```

---

## Task 7: Update RulesPanel — filter logic and UI display

**Files:**
- Modify: `app/(dashboard)/languages/_components/RulesPanel.tsx`

- [ ] **Step 1: Update `filteredRules`**

Change (approximately lines 296-300):
```typescript
const filteredRules = activeCategoryId === 'none'
  ? rules.filter(r => !r.categoryId)
  : activeCategoryId
  ? rules.filter(r => r.categoryId === activeCategoryId)
  : rules
```
to:
```typescript
const filteredRules = activeCategoryId === 'none'
  ? rules.filter(r => r.categoryIds.length === 0)
  : activeCategoryId
  ? rules.filter(r => r.categoryIds.includes(activeCategoryId))
  : rules
```

- [ ] **Step 2: Update category tab counts**

Change (in the `categories.map(cat => ...)` block, approximately line 326):
```typescript
{cat.name} ({rules.filter(r => r.categoryId === cat.id).length})
```
to:
```typescript
{cat.name} ({rules.filter(r => r.categoryIds.includes(cat.id)).length})
```

- [ ] **Step 3: Update "Uncategorized" tab**

Change (approximately line 336):
```typescript
{rules.filter(r => !r.categoryId).length > 0 && (
  <button
    ...
  >
    Uncategorized ({rules.filter(r => !r.categoryId).length})
```
to:
```typescript
{rules.filter(r => r.categoryIds.length === 0).length > 0 && (
  <button
    ...
  >
    Uncategorized ({rules.filter(r => r.categoryIds.length === 0).length})
```

- [ ] **Step 4: Update rule card — show all category badges**

Change the badge display (approximately lines 376-379) from:
```typescript
{rule.categoryId && activeCategoryId === null && (
  <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
    {categories.find(c => c.id === rule.categoryId)?.name}
  </span>
)}
```
to:
```typescript
{rule.categoryIds.length > 0 && activeCategoryId === null && rule.categoryIds.map(cid => (
  <span key={cid} className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
    {categories.find(c => c.id === cid)?.name}
  </span>
))}
```

- [ ] **Step 5: Update `CategoryInput` usage in the form JSX**

Change (approximately lines 462-466):
```typescript
<CategoryInput
  categories={categories}
  value={categoryName}
  onChange={setCategoryName}
/>
```
to:
```typescript
<CategoryInput
  categories={categories}
  values={categoryNames}
  onChange={setCategoryNames}
/>
```

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/languages/_components/RulesPanel.tsx
git commit -m "feat: update RulesPanel to support multiple categories per rule"
```

---

## Task 8: Update practice page filter

**Files:**
- Modify: `app/(dashboard)/practice/page.tsx`

- [ ] **Step 1: Update `visibleRules` filter**

Change (approximately line 138-140):
```typescript
const visibleRules = selectedCategory === null
  ? rules
  : rules.filter(r => r.categoryId === selectedCategory)
```
to:
```typescript
const visibleRules = selectedCategory === null
  ? rules
  : rules.filter(r => r.categoryIds.includes(selectedCategory))
```

- [ ] **Step 2: Check for any other references to `r.categoryId` in practice page**

Search the file:
```bash
grep -n "categoryId" app/\(dashboard\)/practice/page.tsx
```

If any remain, update them to use `categoryIds` (the filter on line 138 is the only expected reference).

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/practice/page.tsx
git commit -m "feat: update practice page category filter for multi-category rules"
```

---

## Task 9: Verify end-to-end

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual smoke test**

1. Open a language's rules page
2. Verify existing rules still show their categories (migration preserved data)
3. Create a new rule — assign 2 categories (one existing, one new)
4. Verify both badges appear on the rule card
5. Verify category filter tabs show correct counts
6. Edit the rule — verify both categories pre-populate
7. Remove one category, save — verify only one remains
8. Open practice page — verify category filter still works
9. Verify "Uncategorized" tab shows rules with no categories

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address any issues found during smoke test"
```