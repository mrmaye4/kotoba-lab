import Anthropic from '@anthropic-ai/sdk'
import type { TaskType } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type EvaluateInput = {
  type: TaskType
  prompt: string
  correctAnswer: string | null
  aiCheckContext: string | null
  userAnswer: string
  interfaceLanguage?: string
}

type EvaluateResult = {
  score: number
  feedback: string
  isCorrect: boolean
}

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[.,!?;:]+$/, '')
}

export async function evaluateAnswer({
  type,
  prompt,
  correctAnswer,
  aiCheckContext,
  userAnswer,
  interfaceLanguage = 'en',
}: EvaluateInput): Promise<EvaluateResult> {
  // MCQ — automatic check
  if (type === 'mcq') {
    const correct = normalize(correctAnswer ?? '')
    const answer = normalize(userAnswer)
    const isCorrect = correct === answer || answer.startsWith(correct) || correct.startsWith(answer.charAt(0))
    return {
      score: isCorrect ? 10 : 0,
      feedback: isCorrect ? 'Correct!' : `Correct answer: ${correctAnswer}`,
      isCorrect,
    }
  }

  // fill_blank and vocabulary — exact match first
  if (type === 'fill_blank' || type === 'vocabulary') {
    if (correctAnswer && normalize(userAnswer) === normalize(correctAnswer)) {
      return { score: 10, feedback: 'Correct!', isCorrect: true }
    }
    // Partial match — send to AI
  }

  // AI check
  return await aiEvaluate({ type, prompt, correctAnswer, aiCheckContext, userAnswer, interfaceLanguage })
}

async function aiEvaluate({
  type,
  prompt,
  correctAnswer,
  aiCheckContext,
  userAnswer,
  interfaceLanguage = 'en',
}: EvaluateInput): Promise<EvaluateResult> {
  const contextParts = [
    correctAnswer ? `Correct answer: ${correctAnswer}` : '',
    aiCheckContext ? `Scoring criteria: ${aiCheckContext}` : '',
  ].filter(Boolean).join('\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: [
      {
        type: 'text',
        text: `You are evaluating a foreign language exercise.
Score the student's answer from 0 to 10 and give brief feedback in ${interfaceLanguage}.
Return ONLY JSON: {"score": <number 0-10>, "feedback": "<text in ${interfaceLanguage}>"}
No markdown, no explanations.

Scale: 10=perfect, 8-9=good (minor error), 6-7=okay (small mistakes), 4-5=partially correct, 0-3=incorrect.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Task type: ${type}
Task: ${prompt}
${contextParts}
Student's answer: ${userAnswer || '(empty)'}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const { score, feedback } = JSON.parse(cleaned)
    return { score: Math.min(10, Math.max(0, Number(score))), feedback, isCorrect: score >= 7 }
  } catch {
    return { score: 0, feedback: 'Failed to evaluate answer', isCorrect: false }
  }
}