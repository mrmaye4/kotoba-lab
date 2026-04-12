import Anthropic from '@anthropic-ai/sdk'
import type { TaskType } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type EvaluateInput = {
  type: TaskType
  prompt: string
  correctAnswer: string | null
  aiCheckContext: string | null
  userAnswer: string
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
}: EvaluateInput): Promise<EvaluateResult> {
  // MCQ — автоматическая проверка
  if (type === 'mcq') {
    const correct = normalize(correctAnswer ?? '')
    const answer = normalize(userAnswer)
    const isCorrect = correct === answer || answer.startsWith(correct) || correct.startsWith(answer.charAt(0))
    return {
      score: isCorrect ? 10 : 0,
      feedback: isCorrect ? 'Верно!' : `Правильный ответ: ${correctAnswer}`,
      isCorrect,
    }
  }

  // fill_blank и vocabulary — сначала точное совпадение
  if (type === 'fill_blank' || type === 'vocabulary') {
    if (correctAnswer && normalize(userAnswer) === normalize(correctAnswer)) {
      return { score: 10, feedback: 'Верно!', isCorrect: true }
    }
    // Частичное совпадение — отправляем в ИИ
  }

  // ИИ-проверка
  return await aiEvaluate({ type, prompt, correctAnswer, aiCheckContext, userAnswer })
}

async function aiEvaluate({
  type,
  prompt,
  correctAnswer,
  aiCheckContext,
  userAnswer,
}: EvaluateInput): Promise<EvaluateResult> {
  const contextParts = [
    correctAnswer ? `Правильный ответ: ${correctAnswer}` : '',
    aiCheckContext ? `Критерии оценки: ${aiCheckContext}` : '',
  ].filter(Boolean).join('\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: [
      {
        type: 'text',
        text: `Ты проверяешь упражнение по иностранному языку.
Оцени ответ студента от 0 до 10 и дай краткую обратную связь на русском языке.
Верни ТОЛЬКО JSON: {"score": <число 0-10>, "feedback": "<текст на русском>"}
Без markdown, без пояснений.

Шкала: 10=отлично, 8-9=хорошо (мелкая погрешность), 6-7=неплохо (небольшие ошибки), 4-5=частично верно, 0-3=неверно.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Тип задания: ${type}
Задание: ${prompt}
${contextParts}
Ответ студента: ${userAnswer || '(пусто)'}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const { score, feedback } = JSON.parse(cleaned)
    return { score: Math.min(10, Math.max(0, Number(score))), feedback, isCorrect: score >= 7 }
  } catch {
    return { score: 0, feedback: 'Не удалось проверить ответ', isCorrect: false }
  }
}