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
} from 'drizzle-orm/pg-core'

// Enums
export const ruleTypeEnum = pgEnum('rule_type', ['rule', 'structure', 'collocation'])
export const sessionStatusEnum = pgEnum('session_status', ['active', 'completed'])
export const taskTypeEnum = pgEnum('task_type', [
  'mcq',
  'fill_blank',
  'transform',
  'open_write',
  'vocabulary',
  'error_find',
  'translate',
])

// Languages
export const languages = pgTable('languages', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  flagEmoji: text('flag_emoji'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Rule categories
export const ruleCategories = pgTable('rule_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  languageId: uuid('language_id').notNull(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Rules
export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  languageId: uuid('language_id').notNull(),
  userId: uuid('user_id').notNull(),
  categoryId: uuid('category_id'),
  title: text('title').notNull(),
  description: text('description'),
  formula: text('formula'),
  type: ruleTypeEnum('type').notNull().default('rule'),
  aiContext: text('ai_context'),
  difficulty: integer('difficulty').notNull().default(3),
  examples: jsonb('examples').$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Rule stats (EMA scoring + SM-2 spaced repetition)
export const ruleStats = pgTable('rule_stats', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: uuid('rule_id').notNull().unique(),
  userId: uuid('user_id').notNull(),
  emaScore: real('ema_score').notNull().default(0.5),
  attemptsTotal: integer('attempts_total').notNull().default(0),
  weakFlag: boolean('weak_flag').notNull().default(false),
  interval: integer('interval').notNull().default(1),
  repetitions: integer('repetitions').notNull().default(0),
  easeFactor: real('ease_factor').notNull().default(2.5),
  nextReview: timestamp('next_review').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Vocabulary categories
export const vocabularyCategories = pgTable('vocabulary_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  languageId: uuid('language_id').notNull(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Vocabulary
export const vocabulary = pgTable('vocabulary', {
  id: uuid('id').primaryKey().defaultRandom(),
  languageId: uuid('language_id').notNull(),
  userId: uuid('user_id').notNull(),
  categoryId: uuid('category_id'),
  word: text('word').notNull(),
  translation: text('translation').notNull(),
  context: text('context'),
  easeFactor: real('ease_factor').notNull().default(2.5),
  interval: integer('interval').notNull().default(1),
  repetitions: integer('repetitions').notNull().default(0),
  nextReview: timestamp('next_review').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Sessions
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  languageId: uuid('language_id').notNull(),
  ruleIds: uuid('rule_ids').array().notNull().default([]),
  status: sessionStatusEnum('status').notNull().default('active'),
  mode: text('mode').notNull().default('practice'),
  theme: text('theme'),
  totalTasks: integer('total_tasks').notNull().default(0),
  completed: integer('completed').notNull().default(0),
  avgScore: real('avg_score'),
  settings: jsonb('settings').$type<{ task_count: number; include_vocab: boolean }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// User settings
export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id').primaryKey(),
  interfaceLanguage: text('interface_language').notNull().default('en'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Tasks
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull(),
  ruleId: uuid('rule_id'),
  type: taskTypeEnum('type').notNull(),
  prompt: text('prompt').notNull(),
  options: jsonb('options').$type<string[]>(),
  correctAnswer: text('correct_answer'),
  aiCheckContext: text('ai_check_context'),
  userAnswer: text('user_answer'),
  score: integer('score'),
  feedback: text('feedback'),
  isCorrect: boolean('is_correct'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Daily practice log
export const dailyPracticeLog = pgTable('daily_practice_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  languageId: uuid('language_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  date: text('date').notNull(), // ISO date string: "2026-04-19"
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniquePerDay: unique().on(t.userId, t.languageId, t.date),
}))