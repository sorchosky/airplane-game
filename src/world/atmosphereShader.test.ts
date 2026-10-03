import { describe, expect, it } from 'vitest'
import { horizonCurveRadius } from '../app/urlFlags'
import { fogVertexChunk, horizonDrop } from './atmosphereShader'

describe('horizon bend (#178)', () => {
  it('drops d² / 2R', () => {
    expect(horizonDrop(0, 30_000)).toBe(0)
    expect(horizonDrop(9_000, 30_000)).toBeCloseTo(1350, 6)
    expect(horizonDrop(9_000, 80_000)).toBeCloseTo(506.25, 6)
  })

  it('leaves the fog vertex chunk untouched when off', () => {
    const chunk = fogVertexChunk(null)
    expect(chunk).toContain('vAtmosphereView = mvPosition.xyz;')
    expect(chunk).not.toContain('curveDrop')
  })

  it('bends before the haze reads the view position, with 1 / 2R baked in', () => {
    const chunk = fogVertexChunk(50_000)
    expect(chunk).toContain('0.000010')
    expect(chunk.indexOf('gl_Position = projectionMatrix * mvPosition')).toBeLessThan(
      chunk.indexOf('vAtmosphereView = mvPosition.xyz'),
    )
  })

  it('reads ?curve=<km> as a radius in metres, off by default', () => {
    expect(horizonCurveRadius('')).toBeNull()
    expect(horizonCurveRadius('?curve=0')).toBeNull()
    expect(horizonCurveRadius('?curve=abc')).toBeNull()
    expect(horizonCurveRadius('?curve=50')).toBe(50_000)
    expect(horizonCurveRadius('?curve=1')).toBe(5_000)
  })
})
