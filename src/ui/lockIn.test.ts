import { describe, expect, it } from 'vitest'
import { captionsEnabled, contractKeyframes, LOCK_IN_STALE_MS, recentLockIn } from './lockIn'

const RECT = { x: 100, y: 50, width: 800, height: 600 }

describe('recentLockIn', () => {
  it('hands over a fresh lock-in and ignores a stale or missing one', () => {
    expect(recentLockIn({ from: RECT, atMs: 1000 }, 1200)).toBe(RECT)
    expect(recentLockIn({ from: RECT, atMs: 1000 }, 1000 + LOCK_IN_STALE_MS + 1)).toBeNull()
    expect(recentLockIn({ from: null, atMs: 1000 }, 1000)).toBeNull()
  })
})

describe('contractKeyframes', () => {
  it('starts on the calibrate frame and ends in place', () => {
    const to = { x: 16, y: 16, width: 200, height: 150 }
    expect(contractKeyframes(RECT, to)).toEqual([
      { transform: 'translate(84px, 34px) scale(4, 4)' },
      { transform: 'translate(0px, 0px) scale(1, 1)' },
    ])
  })

  it('returns null for a target with no size', () => {
    expect(contractKeyframes(RECT, { x: 0, y: 0, width: 0, height: 0 })).toBeNull()
  })
})

describe('captionsEnabled', () => {
  it('is on with ?captions or a stored opt-in, off otherwise', () => {
    expect(captionsEnabled('?captions', null)).toBe(true)
    expect(captionsEnabled('?input=pose', '1')).toBe(true)
    expect(captionsEnabled('?input=pose', null)).toBe(false)
    expect(captionsEnabled('', '0')).toBe(false)
  })
})
