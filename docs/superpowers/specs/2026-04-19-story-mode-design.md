# Story Mode — Design Spec

## Overview

A new session mode `story` where Claude generates two short stories tied to the session's selected rules. The user translates each story in full — one from the target language to English, one from English to the target language. Grammar hints from the rules are available behind a button so the user can attempt without spoilers.

## New Session Mode

Add `'story'` to the `SessionMode` union type in `types/index.ts` (or wherever it's defined).

Add a `Story` option to the `MODES` array on the practice page with a description like `"Translate full stories built around your rules"`.

## New Task Type

Add `'story_translate'` to the `taskTypeEnum` in `lib/db/schema.ts` and run a migration.

## Paragraph Count Setting

When `story` mode is selected on the practice page, show a paragraph count selector: **1 / 2 / 3 / 5** (buttons, default 2). Store as a session setting alongside existing ones (e.g., in `settings.paragraph_count`).

## Session Structure

A story session always has exactly **2 tasks**:

| # | Prompt language | Translation direction |
|---|---|---|
| 1 | Target language | → English |
| 2 | English | → Target language |

`totalTasks` is set to `2` on session creation.

## Generation (`lib/claude/generate.ts`)

Add a new `generateStoryTasks` function called when `mode === 'story'`.

One Claude call generates both stories and hints together (single API call):

**Input to Claude:**
- Rules with titles, descriptions, formulas, examples
- Target language name
- Paragraph count
- Interface language (for hints text)

**Claude output (JSON):**
```json
{
  "story_target": "Full story in target language, N paragraphs...",
  "story_english": "Full story in English, N paragraphs, same theme...",
  "hints": [
    "Use the passive voice construction (受け身形) for actions done to the subject",
    "The て-form connects sequential actions: verb-て + next verb",
    "..."
  ]
}
```

Stories share a theme and narrative but are not translations of each other — they are independent texts covering the same grammar constructions.

Hints are stored in `aiCheckContext` on each task (same hints for both tasks).

## Task Fields

| Field | Task 1 | Task 2 |
|---|---|---|
| `type` | `story_translate` | `story_translate` |
| `prompt` | Story in target language | Story in English |
| `correctAnswer` | `null` (open-ended) | `null` |
| `aiCheckContext` | JSON: `{ direction: "to_en", hints: [...] }` | JSON: `{ direction: "to_target", hints: [...] }` |
| `options` | `null` | `null` |

## Session Page UI

The session page needs a branch for `story_translate` task type:

- Display the story text in a styled read-only block (larger font, line breaks preserved)
- Large `<textarea>` for the translation (min 8 rows)
- **"Show hints"** toggle button — hidden by default, reveals the hints list when clicked
- Submit button: "Submit translation"
- After submit: AI evaluates the translation and shows detailed feedback (existing check/evaluate flow)

No MCQ options, no short answer — only the textarea.

## Evaluation

Reuse the existing `open_write` evaluation path in `app/api/check/route.ts` or `app/api/batch-evaluate/route.ts`. The `aiCheckContext` provides hints and direction context so Claude can evaluate translation quality against the rule constructions.

Story mode sessions use `mode === 'story'` so the check route can adjust the prompt: ask Claude to evaluate translation accuracy + correct use of the grammar constructions from the hints.

## Practice Page Changes

- Add `Story` to the `MODES` array
- When `mode === 'story'` is selected, show paragraph count selector (1 / 2 / 3 / 5, default 2) and hide the task count selector (task count is always 2)
- Pass `paragraphCount` in session settings

## Out of Scope

- Mixed story + regular tasks in one session
- More than 2 stories per session
- User choosing which direction to translate
