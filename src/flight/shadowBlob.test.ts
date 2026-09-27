import { describe, expect, it } from 'vitest'
import {
  SHADOW_BLOB_PARAMS,
  buildShadowAlphaData,
  shadowAnchor,
  shadowBlob,
  shadowFalloff,
} from './shadowBlob'

describe('shadowBlob', () => {
  const { fadeStart, fadeEnd, radiusAtGround, radiusAtFadeEnd, opacityAtGround } =
    SHADOW_BLOB_PARAMS

  it('is at its darkest and smallest on the ground', () => {
    const blob = shadowBlob(0)
    expect(blob.opacity).toBeCloseTo(opacityAtGround)
    expect(blob.radius).toBeCloseTo(radiusAtGround)
  })

  it('is gone at and above the 60 m fade end', () => {
    expect(fadeEnd).toBe(60)
    expect(shadowBlob(fadeEnd).opacity).toBe(0)
    expect(shadowBlob(147).opacity).toBe(0)
  })

  it('grows and fades steadily with height, without a pop', () => {
    let previous = shadowBlob(0)
    for (let h = 0.5; h <= fadeEnd; h += 0.5) {
      const blob = shadowBlob(h)
      expect(blob.opacity).toBeLessThanOrEqual(previous.opacity)
      expect(blob.radius).toBeGreaterThanOrEqual(previous.radius)
      expect(previous.opacity - blob.opacity).toBeLessThan(0.02)
      previous = { ...blob }
    }
    expect(previous.radius).toBeCloseTo(radiusAtFadeEnd)
  })

  it('still reads clearly through a low pass', () => {
    expect(shadowBlob(20).opacity).toBeGreaterThan(0.3)
    expect(shadowBlob(fadeStart).opacity).toBeGreaterThan(0.3)
  })

  it('treats a height below the surface as on it', () => {
    expect(shadowBlob(-5)).toEqual(shadowBlob(0))
  })

  it('writes into out', () => {
    const out = { radius: 0, opacity: 0 }
    expect(shadowBlob(10, SHADOW_BLOB_PARAMS, out)).toBe(out)
  })
})

describe('shadow alpha', () => {
  it('is solid in the core and clear at the rim', () => {
    expect(shadowFalloff(0)).toBe(1)
    expect(shadowFalloff(0.3)).toBe(1)
    expect(shadowFalloff(1)).toBe(0)
    expect(shadowFalloff(0.65)).toBeGreaterThan(0)
    expect(shadowFalloff(0.65)).toBeLessThan(1)
  })

  it('bakes a round, soft disc with clear corners', () => {
    const size = 32
    const data = buildShadowAlphaData(size)
    expect(data.length).toBe(size * size * 4)
    const texel = (x: number, y: number) => data[(y * size + x) * 4 + 1] ?? -1
    expect(texel(size / 2, size / 2)).toBe(255)
    expect(texel(0, 0)).toBe(0)
    expect(texel(0, size / 2)).toBe(texel(size / 2, 0))
    expect(texel(size - 1, size / 2)).toBeLessThan(30)
  })
})

describe('shadowAnchor', () => {
  const sun = [0.6, 0.5, 0.62] as const
  const length = Math.hypot(...sun)
  const sunDirection = sun.map((v) => v / length) as unknown as [number, number, number]

  it('lands on flat ground along the ray away from the sun', () => {
    const anchor = shadowAnchor(100, 30, -40, sunDirection, () => 10)
    expect(anchor.y).toBe(10)
    expect(anchor.height).toBeCloseTo(20)
    // Moved away from the sun: the offset points against its horizontal direction.
    const dx = anchor.x - 100
    const dz = anchor.z + 40
    expect(dx).toBeLessThan(0)
    expect(dz).toBeLessThan(0)
    // Back along the ray to the plane: the offset over the drop matches the sun's slope.
    const [sx, sy, sz] = sunDirection
    expect(Math.hypot(dx, dz) / 20).toBeCloseTo(Math.hypot(sx, sz) / sy, 5)
  })

  it('converges on a slope, landing on the surface under its own point', () => {
    // Ground rising away from the sun (toward -X): 0.2 m per m.
    const surfaceAt = (x: number) => 10 - 0.2 * x
    const anchor = shadowAnchor(0, 40, 0, sunDirection, surfaceAt)
    expect(anchor.y).toBeCloseTo(surfaceAt(anchor.x), 6)
    // The point really is on the sun's ray through the plane.
    const [sx, sy] = sunDirection
    expect(-anchor.x / (40 - anchor.y)).toBeCloseTo(sx / sy, 1)
  })

  it('drops straight down with the sun at the horizon', () => {
    const anchor = shadowAnchor(5, 30, 6, [1, 0, 0], () => 0)
    expect([anchor.x, anchor.z, anchor.height]).toEqual([5, 6, 30])
  })
})
