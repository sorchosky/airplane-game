import { describe, expect, it } from 'vitest'
import { CAMERA_HANDOFF_S } from '../../flight/cameraMath'
import { LOCK_IN_CONTRACT_MS } from '../../ui/lockIn'
import { FLIGHT_TRANSITION, flightBlur, ringDiameter } from './flightTransition'

describe('FLIGHT_TRANSITION (#161)', () => {
  it('holds the ticket timings', () => {
    expect(FLIGHT_TRANSITION.ringMs).toBe(400)
    expect(FLIGHT_TRANSITION.fadeMs).toBe(400)
    expect(FLIGHT_TRANSITION.sharedMs).toBe(700)
    expect(LOCK_IN_CONTRACT_MS).toBe(700)
    expect(FLIGHT_TRANSITION.blurMs).toBe(600)
    expect(FLIGHT_TRANSITION.reducedMs).toBe(200)
    expect(CAMERA_HANDOFF_S).toBe(1.2)
  })

  it('lets the press finish inside the ring span', () => {
    expect(FLIGHT_TRANSITION.pressMs).toBeLessThan(FLIGHT_TRANSITION.ringMs)
  })
})

describe('flightBlur', () => {
  it('ramps from where it was to sharp over the duration', () => {
    expect(flightBlur(0, 1, 600)).toBe(1)
    expect(flightBlur(0, 0.6, 600)).toBeCloseTo(0.6, 9)
    expect(flightBlur(600, 1, 600)).toBe(0)
    expect(flightBlur(900, 1, 600)).toBe(0)
  })

  it('falls monotonically, fastest at the start (ease out)', () => {
    let last = 1
    for (let t = 0; t <= 600; t += 50) {
      const blur = flightBlur(t, 1, 600)
      expect(blur).toBeLessThanOrEqual(last)
      last = blur
    }
    expect(1 - flightBlur(100, 1, 600)).toBeGreaterThan(flightBlur(500, 1, 600))
  })

  it('a zero duration is a cut', () => {
    expect(flightBlur(0, 1, 0)).toBe(0)
  })
})

describe('ringDiameter', () => {
  const box = { left: 0, top: 0, width: 200, height: 100 }

  it('reaches the farthest corner from the contact point', () => {
    expect(ringDiameter(100, 50, box)).toBeCloseTo(2 * Math.hypot(100, 50), 9)
    expect(ringDiameter(0, 0, box)).toBeCloseTo(2 * Math.hypot(200, 100), 9)
  })

  it('covers every corner of the frame', () => {
    const x = 60
    const y = 30
    const radius = ringDiameter(x, y, box) / 2
    for (const [cx, cy] of [
      [0, 0],
      [200, 0],
      [0, 100],
      [200, 100],
    ] as const) {
      expect(Math.hypot(cx - x, cy - y)).toBeLessThanOrEqual(radius + 1e-9)
    }
  })
})
