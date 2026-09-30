import { describe, expect, it } from 'vitest'
import { applyRingSpeedGain, createGoldenPathRoute, segmentHitsSphere } from './goldenPath'
import { insideTrigger, type Landmark } from './landmarks'

const arch = {
  trigger: { shape: 'box', center: [2000, 100, -2000], halfExtents: [20, 30, 12], yaw: 0 },
} as unknown as Landmark

describe('golden path', () => {
  it('lays out three rings ahead and bends them toward the arch', () => {
    const route = createGoldenPathRoute({ x: 0, y: 120, z: 0 }, arch)
    expect(route.rings).toHaveLength(3)
    expect(route.rings[0]!.z).toBeLessThan(0)
    expect(route.rings[2]!.x).toBeGreaterThan(route.rings[0]!.x)
  })

  it('retains the arch trigger that completes the route', () => {
    const route = createGoldenPathRoute({ x: 0, y: 120, z: 0 }, arch)
    expect(insideTrigger(route.arch.trigger, route.arch.trigger.center)).toBe(true)
  })

  it('detects a pass even when the frame endpoints are outside the ring', () => {
    expect(
      segmentHitsSphere({ x: 0, y: 0, z: 20 }, { x: 0, y: 0, z: -20 }, { x: 0, y: 0, z: 0 }, 5),
    ).toBe(true)
    expect(
      segmentHitsSphere({ x: 20, y: 0, z: 20 }, { x: 20, y: 0, z: -20 }, { x: 0, y: 0, z: 0 }, 5),
    ).toBe(false)
  })

  it('adds a small speed reward without exceeding the flight limit', () => {
    const flight = { speed: 67 }
    expect(applyRingSpeedGain(flight, 68)).toBe(68)
  })
})
