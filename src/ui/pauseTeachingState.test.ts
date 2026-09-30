import { describe, expect, it } from 'vitest'
import {
  createPauseTeachingState,
  stepPauseTeaching,
  type PauseTeachingFrame,
} from './pauseTeachingState'

const FADE_MS = 400
const PAUSE_MS = 5000
const base: PauseTeachingFrame = {
  eligible: true,
  game: 'flying',
  controlPhase: 'active',
  controlSinceMs: 0,
  nowMs: 0,
  reducedMotion: false,
}

function step(state = createPauseTeachingState(), changes: Partial<PauseTeachingFrame> = {}) {
  return stepPauseTeaching(state, { ...base, ...changes }, FADE_MS, PAUSE_MS)
}

describe('pause teaching visual state', () => {
  it('gates teaching, then keeps the control prompt suppressed through fade-out', () => {
    const active = step()
    const dropped = step(active.state, {
      controlPhase: 'inactive',
      controlSinceMs: 100,
      nowMs: 1100,
    })
    expect(dropped.shown).toBe(true)
    expect(dropped.progress).toBe(0.2)

    const reengaged = step(dropped.state, { nowMs: 1200 })
    expect(reengaged.shown).toBe(false)
    expect(reengaged.suppressControlPrompt).toBe(true)
    expect(step(reengaged.state, { nowMs: 1599 }).suppressControlPrompt).toBe(true)
    expect(step(reengaged.state, { nowMs: 1600 }).suppressControlPrompt).toBe(false)
  })

  it('resets progress on retry and finishes once the flight pauses', () => {
    const active = step()
    const firstDrop = step(active.state, {
      controlPhase: 'inactive',
      nowMs: 2000,
      controlSinceMs: 1000,
    })
    const reengaged = step(firstDrop.state, { nowMs: 2100 })
    const retry = step(reengaged.state, {
      controlPhase: 'inactive',
      controlSinceMs: 3000,
      nowMs: 3100,
    })
    expect(retry.progress).toBe(0.02)

    const paused = step(retry.state, { game: 'paused', controlPhase: 'paused', nowMs: 8000 })
    const resumedInactive = step(paused.state, {
      controlPhase: 'inactive',
      controlSinceMs: 9000,
      nowMs: 9200,
    })
    expect(resumedInactive.shown).toBe(false)
  })

  it('never shows when ineligible and hides immediately with reduced motion', () => {
    const active = step()
    expect(step(active.state, { eligible: false, controlPhase: 'inactive' }).shown).toBe(false)
    const dropped = step(active.state, { controlPhase: 'inactive' })
    const hidden = step(dropped.state, { reducedMotion: true })
    expect(hidden.suppressControlPrompt).toBe(false)
  })
})
