import { createNoise2D, createNoise4D } from 'simplex-noise'
import { describe, expect, it } from 'vitest'
import { mulberry32 } from './heightfield'
import {
  FEATURE_MATCH,
  matchNoise2D,
  sampleTorus,
  torusNoise,
  torusPoint,
  torusRadius,
  wrapIndex,
  wrapNear,
} from './torusNoise'

const P = 24000
const noise = createNoise4D(mulberry32(7))

describe('torusNoise', () => {
  it('repeats exactly every period on x and on z', () => {
    for (let i = 0; i < 200; i++) {
      const x = Math.sin(i * 12.9898) * 30000
      const z = Math.cos(i * 78.233) * 30000
      const v = torusNoise(noise, x, z, 1300, P)
      expect(torusNoise(noise, x + P, z, 1300, P)).toBeCloseTo(v, 9)
      expect(torusNoise(noise, x, z + P, 1300, P)).toBeCloseTo(v, 9)
      expect(torusNoise(noise, x - 3 * P, z + 2 * P, 1300, P)).toBeCloseTo(v, 9)
    }
  })

  it('keeps feature size: one metre of ground is FEATURE_MATCH / scale noise units of arc', () => {
    const scale = 1300
    const r = torusRadius(scale, P)
    const a = torusPoint(0, 0, P, { cx: 0, sx: 0, cz: 0, sz: 0 })
    const b = torusPoint(1, 0, P, { cx: 0, sx: 0, cz: 0, sz: 0 })
    const chord = r * Math.hypot(a.cx - b.cx, a.sx - b.sx, a.cz - b.cz, a.sz - b.sz)
    expect(chord).toBeCloseTo(FEATURE_MATCH / scale, 9)
  })

  it('is smooth: neighbours a metre apart differ by little, as 2D noise does', () => {
    const noise2D = createNoise2D(mulberry32(7))
    let worst4 = 0
    let worst2 = 0
    for (let i = 0; i < 2000; i++) {
      const x = i * 37.1
      const z = i * 11.7
      worst4 = Math.max(
        worst4,
        Math.abs(torusNoise(noise, x + 1, z, 180, P) - torusNoise(noise, x, z, 180, P)),
      )
      worst2 = Math.max(
        worst2,
        Math.abs(noise2D((x + 1) / 180, z / 180) - noise2D(x / 180, z / 180)),
      )
    }
    expect(worst4).toBeLessThan(2 * worst2)
  })

  it('spreads like 2D simplex noise after matching', () => {
    const noise2D = createNoise2D(mulberry32(3))
    const share = (values: number[], t: number) =>
      values.filter((v) => v > t).length / values.length
    const v2: number[] = []
    const v4: number[] = []
    for (let i = 0; i < 40000; i++) {
      const x = (i * 7919.3) % P
      const z = (i * 104.729) % P
      v2.push(noise2D(x / 1300, z / 1300))
      v4.push(torusNoise(noise, x, z, 1300, P))
    }
    for (const t of [0, 0.2, 0.35, 0.5, 0.62]) expect(share(v4, t)).toBeCloseTo(share(v2, t), 1)
  })

  it('offsets give an unrelated field', () => {
    const p = torusPoint(500, 900, P, { cx: 0, sx: 0, cz: 0, sz: 0 })
    const r = torusRadius(700, P)
    expect(sampleTorus(noise, p, r, 17)).not.toBeCloseTo(sampleTorus(noise, p, r), 3)
  })
})

describe('matchNoise2D', () => {
  it('is odd, monotonic and stays in -1..1', () => {
    let previous = -Infinity
    for (let v = -1; v <= 1.0001; v += 0.01) {
      const m = matchNoise2D(v)
      expect(m).toBeGreaterThanOrEqual(previous)
      expect(Math.abs(m)).toBeLessThanOrEqual(1)
      expect(matchNoise2D(-v)).toBeCloseTo(-m, 12)
      previous = m
    }
    expect(matchNoise2D(0)).toBe(0)
    expect(matchNoise2D(1)).toBe(1)
  })
})

describe('wrapping helpers', () => {
  it('wrapNear picks the copy nearest the centre', () => {
    expect(wrapNear(100, 0, P)).toBe(100)
    expect(wrapNear(100 + P, 0, P)).toBe(100)
    expect(wrapNear(-P + 50, 1750, P)).toBe(50)
    expect(Math.abs(wrapNear(13_000, 0, P))).toBeLessThanOrEqual(P / 2)
  })

  it('wrapIndex is a positive modulo', () => {
    expect(wrapIndex(-1, 10)).toBe(9)
    expect(wrapIndex(23, 10)).toBe(3)
  })
})
