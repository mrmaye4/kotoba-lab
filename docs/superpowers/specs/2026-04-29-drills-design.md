# Drills Feature — Design Spec

**Date:** 2026-04-29

## Summary

A dedicated "Drills" section for quick, button-based pattern drills with per-item spaced repetition. Targets grammar patterns like gerund/infinitive verb choices and countable/uncountable article selection. AI generates the item list once per rule; SM-2 schedules reviews per item indefinitely.

---

## User Flow

1. User navigates to `/drills` in the top nav
2. Sees all rules for the selected language, each showing item count + due count
3. Rules with no items yet show a "Generate" button — clicking triggers AI generation
4. "Drill" button opens the drill session for that rule
5. A "Review all" banner appears when any items are due, allowing cross-rule review

**Drill session:**
1. Show prompt word/phrase (e.g. "enjoy" or "water")
2. Show 2–4 choice buttons (e.g. ["doing", "to do"] or ["a", "an", "some", "—"])
3. User taps a choice — immediate feedback (green correct / red wrong + reveal correct)
4. "Next →" advances to next item
5. Session ends when all due items are done; shows summary (score, streak)

---

## Data Model

### New table: `drill_items`

```ts
export const drillItems = pgTable('drill_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: uuid('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
  languageId: uuid('language_id').notNull(),
  userId: uuid('user_id').notNull(),
  prompt: text('prompt').notNull(),           // "enjoy" / "water"
  choices: jsonb('choices').$type<string[]>().notNull(), // ["doing", "to do"]
  correctAnswer: text('correct_answer').notNull(),       // "doing"
  easeFactor: real('ease_factor').notNull().default(2.5),
  interval: integer('interval').notNull().default(1),
  repetitions: integer('repetitions').notNull().default(0),
  nextReview: timestamp('next_review').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

SM-2 logic is identical to vocabulary — reuse `lib/vocabulary/sm2.ts`.

---

## AI Generation

Prompt sent to Claude (Haiku for cost) per rule:

> Given this grammar rule: `{title}`, `{description}`, `{formula}`, `{examples}`
> Generate a JSON array of drill items. Each item: `{ prompt, choices, correctAnswer }`.
> For gerund/infinitive rules: prompt = a verb, choices = ["doing", "to do"], correct = whichever applies.
> For countable/uncountable rules: prompt = a noun, choices = ["a", "an", "some", "—"], correct = the natural article.
> Return 15–25 items. No duplicates.

The AI determines the correct drill format from the rule type and description — no hardcoded rule-type mapping needed.

---

## Pages

### `/drills`
- Language selector (if multiple languages)
- "X due" banner with "Review all" button
- List of rules with drill items: title, "N items · M due", Drill button
- Rules without items: "Generate" button (triggers POST /api/drills/generate, shows loading state)


### `/drills/session?ruleIds=...&mode=due|all`
Single session page used for both single-rule and "review all" modes.
- `ruleIds` — comma-separated list of rule IDs (one for single drill, multiple for "review all")
- `mode=due` — only due items; `mode=all` — all items shuffled
- Progress bar (current / total)
- Rule name label (shown per item when multiple rules are mixed)
- Prompt word (large, centered)
- Choice buttons (2–4)
- After answer: highlight correct/wrong, "Next →" button
- End screen: score X/Y, "Practice again" / "Back to drills"

---

## API Routes

### `GET /api/drills?languageId=`
Returns rules for the language with drill item counts and due counts.

```ts
// Response
[{ ruleId, title, totalItems, dueItems }]
```

### `POST /api/drills/generate`
Body: `{ ruleId }`  
Calls Claude (Haiku), inserts generated `drill_items` into DB.  
Idempotent: deletes existing items for the rule before inserting new ones.

### `GET /api/drills/items?ruleIds=&mode=due|all`
Returns drill items for a session. `ruleIds` is comma-separated. `due` filters `nextReview <= now`, `all` returns everything shuffled.

### `POST /api/drills/review`
Body: `{ itemId, correct: boolean }`  
Applies SM-2 update, returns updated `nextReview`.

---

## Navigation

Add "Drills" link to `TopNav.tsx` alongside Practice, History, etc.

---

## Out of Scope

- Editing individual drill items manually (can add later)
- Drill items for vocabulary (separate from rules)
- Custom choice sets per item (AI decides choices, not user)