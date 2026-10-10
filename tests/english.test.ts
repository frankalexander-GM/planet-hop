import { describe, expect, test } from 'bun:test'
import englishLearning from '../public/english-learning.js'

describe('English learning helpers', () => {
  test('contains separate A2 and B1 banks and returns level-appropriate prompts', () => {
    expect(englishLearning.banks.A2.length).toBeGreaterThanOrEqual(10)
    expect(englishLearning.banks.B1.length).toBeGreaterThanOrEqual(10)
    expect(englishLearning.createSession('B1', () => 0).level).toBe('B1')
  })

  test('normalizes accents, case, punctuation, and whitespace for answers', () => {
    const question = englishLearning.banks.A2[0]
    const accepted = question.answers[0]
    const noisy = '  ' + accepted.toUpperCase().replace('ESCUELA', 'ESCUÉLA') + '!!!  '
    expect(englishLearning.isCorrect(question, noisy)).toBe(true)
    expect(englishLearning.isCorrect(question, 'completamente incorrecto')).toBe(false)
  })

  test('shuffles questions and does not repeat until a full bank cycle is used', () => {
    const session = englishLearning.createSession('A2', () => 0)
    const firstCycle = Array.from({ length: session.size }, () => session.next().prompt)
    expect(new Set(firstCycle).size).toBe(session.size)
    const nextQuestion = session.next()
    expect(firstCycle).toContain(nextQuestion.prompt)

    const reversed = englishLearning.createSession('A2', () => 0.99)
    expect(reversed.next().prompt).not.toBe(firstCycle[0])
  })

  test('fires each 300-point milestone once, including multiple thresholds crossed at once', () => {
    const tracker = englishLearning.createMilestoneTracker(300, 0)
    expect(tracker.observe(299)).toEqual([])
    expect(tracker.observe(300)).toEqual([300])
    expect(tracker.observe(300)).toEqual([])
    expect(tracker.observe(950)).toEqual([600, 900])
    expect(tracker.observe(600)).toEqual([])
    expect(tracker.observe(1200)).toEqual([1200])
  })
})
