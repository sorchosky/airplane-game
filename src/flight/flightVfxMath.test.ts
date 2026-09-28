import { describe, expect, it } from 'vitest'
import { cameraShake, lowPassIntensity, speedVfxIntensity } from './flightVfxMath'

describe('flight VFX', () => {
  it('keeps speed effects off at cruise and fades them in above 1.08 cruise', () => {
    expect(speedVfxIntensity(45, 45)).toBe(0)
    expect(speedVfxIntensity(48.6, 45)).toBe(0)
    expect(speedVfxIntensity(55, 45)).toBeGreaterThan(0)
    expect(speedVfxIntensity(80, 45)).toBe(1)
  })

  it('keeps shake bounded and absent when its intensity is zero', () => {
    expect(cameraShake(3, 0)).toEqual([0, 0])
    expect(cameraShake(3, 1).every((axis) => Math.abs(axis) <= 0.075001)).toBe(true)
  })

  it('fades low-pass contact out over the lowest eight metres', () => {
    expect(lowPassIntensity(0)).toBe(1)
    expect(lowPassIntensity(4)).toBe(0.5)
    expect(lowPassIntensity(8)).toBe(0)
  })
})
