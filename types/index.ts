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

export type RuleWithStats = {
  id: string
  categoryId?: string | null
  title: string
  description: string | null
  formula: string | null
  type: 'rule' | 'structure' | 'collocation'
  aiContext: string | null
  difficulty: number
  examples: string[] | null
  emaScore: number | null
  weakFlag: boolean | null
  nextReview?: string | null
}

export type Task = {
  id: string
  sessionId: string
  ruleId: string | null
  type: TaskType
  prompt: string
  options: string[] | null
  correctAnswer: string | null
  aiCheckContext: string | null
  userAnswer: string | null
  score: number | null
  feedback: string | null
  isCorrect: boolean | null
}

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