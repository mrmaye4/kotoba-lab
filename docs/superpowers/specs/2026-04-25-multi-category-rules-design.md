# Design: Multi-Category Rules

**Date:** 2026-04-25  
**Status:** Approved

## Problem

Rules currently support a single `categoryId` (FK → `rule_categories`). The user wants to assign multiple categories to a single rule.

## Solution

Replace the single `categoryId` column on `rules` with a many-to-many join table `rule_category_links`. Existing category assignments are migrated automatically during the Drizzle migration.

---

## 1. Database Schema

### New table

```typescript
export const ruleCategoryLinks = pgTable('rule_category_links', {
  ruleId: uuid('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => ruleCategories.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.ruleId, t.categoryId] })])
```

### Removed column

`categoryId uuid` is dropped from the `rules` table.

### Migration (safe, data-preserving)

```sql
-- Step 1: create join table
CREATE TABLE rule_category_links (
  rule_id uuid NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES rule_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, category_id)
);

-- Step 2: migrate existing assignments
INSERT INTO rule_category_links (rule_id, category_id)
SELECT id, category_id FROM rules WHERE category_id IS NOT NULL;

-- Step 3: drop old column
ALTER TABLE rules DROP COLUMN category_id;
```

Steps 2 and 3 are sequential — no existing assignments are lost.

---

## 2. TypeScript Types

`RuleWithStats` updated:

```typescript
// Before
categoryId?: string | null

// After
categoryIds: string[]
```

---

## 3. API Changes

### GET /api/rules

Returns `categoryIds: string[]` per rule (via LEFT JOIN on `rule_category_links`, grouped with `array_agg`).

### POST /api/rules

Accepts `categoryIds?: string[]`. After inserting the rule, inserts rows into `rule_category_links` for each ID.

### PATCH /api/rules

Accepts `categoryIds?: string[]`. Full replace strategy: delete all existing links for the rule, then insert new ones. This is simpler and correct for this use case.

### DELETE /api/rules/categories

No change needed — `onDelete: 'cascade'` on `rule_category_links.categoryId` handles cleanup automatically.

---

## 4. UI Changes

### RulesPanel — CategoryInput (form)

Multi-select combobox:
- Selected categories rendered as dismissible badges inside the input area
- Typing filters existing categories; selecting adds to the set
- Creating a new category (type name → click button) adds it to the set immediately
- Submitting resolves each name to an ID (create if not exists), sends `categoryIds[]`

### RulesPanel — Category filter tabs

No structural change. Filtering logic updated:

```typescript
// Before
rules.filter(r => r.categoryId === selectedCategory)

// After
rules.filter(r => r.categoryIds.includes(selectedCategory))

// Uncategorized
rules.filter(r => r.categoryIds.length === 0)
```

Rule cards display all category badges (not just one).

### Practice page

Same filter logic update as above (`categoryIds.includes`).

---

## 5. Out of Scope

- Renaming "category" to "tag" in the UI — keeping current naming
- Category ordering — unordered set
- Filtering rules that match ALL selected categories (AND logic) — filter remains OR/single-select
