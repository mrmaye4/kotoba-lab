// SM-2 spaced repetition algorithm
// q: 0=Again, 2=Hard, 4=Good, 5=Easy

export type SM2Card = {
  easeFactor: number
  interval: number
  repetitions: number
}

export type SM2Result = SM2Card & {
  nextReview: Date
}

export function calculateNextReview(card: SM2Card, q: number): SM2Result {
  let { easeFactor, interval, repetitions } = card

  if (q < 3) {
    // Failed — reset
    repetitions = 0
    interval = 1
  } else {
    // Passed
    if (repetitions === 0) {
      interval = 1
    } else if (repetitions === 1) {
      interval = 6
    } else {
      interval = Math.round(interval * easeFactor)
    }
    repetitions++
    easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  }

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + interval)

  return { easeFactor, interval, repetitions, nextReview }
}