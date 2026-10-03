import { describe, expect, it } from 'vitest'
import { MAX_CAST_FRAME_S, seededElapsed } from './castClock'

describe('seededElapsed', () => {
  it('leaves an ordinary 30 fps frame alone', () => {
    expect(seededElapsed(100, 100 - 1 / 30)).toBe(100 - 1 / 30)
  })

  it('caps the first frame after the cap turns on, when R3F has zeroed the clock', () => {
    // Ten minutes into flight: unseeded, the delta would be 600 s.
    const now = 600
    expect(now - seededElapsed(now, 0)).toBeCloseTo(MAX_CAST_FRAME_S)
  })

  it('caps a long stall to the max step', () => {
    expect(10 - seededElapsed(10, 7)).toBeCloseTo(MAX_CAST_FRAME_S)
  })

  it('never hands the scene a negative delta', () => {
    expect(seededElapsed(5, 8)).toBe(5)
  })
})
