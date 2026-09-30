import { describe, expect, it } from 'vitest'
import { createBlendedLighting, timeOfDay } from '../world/timeOfDay'
import { PLANE_OUTLINE_LIFT, planeOutlineNightMix } from './planeOutline'

const lighting = createBlendedLighting()
const mixAt = (minutes: number) => planeOutlineNightMix(timeOfDay(minutes, lighting).nightAmount)

describe('plane outline night lift', () => {
  it('holds near-black through the reported dawn and dusk problem times', () => {
    expect(mixAt(5 * 60 + 30)).toBe(0)
    expect(mixAt(20 * 60)).toBeLessThan(0.01)
  })

  it('reaches the restrained night edge lift at the night keys and midnight', () => {
    for (const minutes of [0, 3 * 60 + 30, 22 * 60, 24 * 60]) expect(mixAt(minutes)).toBe(1)
  })

  it('stays bounded at every required visual-review time', () => {
    const reviewTimes = [
      [0, 1],
      [3 * 60 + 30, 1],
      [5 * 60 + 30, 0],
      [7 * 60, 0],
      [12 * 60, 0],
      [18 * 60 + 30, 0],
      [20 * 60, 0.0045],
      [22 * 60, 1],
    ] as const
    for (const [minutes, expected] of reviewTimes) {
      expect(mixAt(minutes), `${Math.floor(minutes / 60)}:${minutes % 60}`).toBeCloseTo(expected, 3)
    }
  })

  it('is continuous with a flat slope at both named thresholds', () => {
    const epsilon = 0.0001
    for (const threshold of [PLANE_OUTLINE_LIFT.start, PLANE_OUTLINE_LIFT.full]) {
      const at = planeOutlineNightMix(threshold)
      expect(Math.abs(at - planeOutlineNightMix(threshold - epsilon))).toBeLessThan(0.000001)
      expect(Math.abs(planeOutlineNightMix(threshold + epsilon) - at)).toBeLessThan(0.000001)
    }
  })

  it('clamps invalid range extremes', () => {
    expect(planeOutlineNightMix(-1)).toBe(0)
    expect(planeOutlineNightMix(2)).toBe(1)
  })
})
