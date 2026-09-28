import { describe, expect, it } from 'vitest'
import { lightingPresets } from '../styles/tokens'
import { createBlendedLighting, LIGHT_COLOR_ROLES, TIME_KEYS, timeOfDay } from './timeOfDay'

const sample = createBlendedLighting()
const display = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

describe('time of day', () => {
  it('lands on every preset at its keyframe, including both sides of midnight', () => {
    for (const key of TIME_KEYS) {
      timeOfDay(key.minute, sample)
      const preset = lightingPresets[key.phase]
      for (const role of LIGHT_COLOR_ROLES) {
        display(preset[role]).forEach((channel, i) =>
          expect(sample.colors[role][i], `${key.phase} ${role} channel ${i}`).toBeCloseTo(
            channel,
            3,
          ),
        )
      }
      expect(sample.sunIntensity).toBeCloseTo(preset.sunIntensity)
    }
  })

  it('eases without a slope kink, including at midnight', () => {
    for (const key of TIME_KEYS) {
      const at = timeOfDay(key.minute, sample).colors.skyHorizon[0]!
      const before = timeOfDay(key.minute - 0.01, sample).colors.skyHorizon[0]!
      const after = timeOfDay(key.minute + 0.01, sample).colors.skyHorizon[0]!
      expect(Math.abs(at - before)).toBeLessThan(0.00001)
      expect(Math.abs(after - at)).toBeLessThan(0.00001)
    }
    const midnight = timeOfDay(0, sample).nightAmount
    expect(timeOfDay(1440, sample).nightAmount).toBe(midnight)
    expect(timeOfDay(-1, sample).nightAmount).toBe(midnight)
  })

  it('uses perceptual OKLab interpolation rather than a raw sRGB midpoint', () => {
    timeOfDay((420 + 720) / 2, sample)
    const a = display(lightingPresets.morning.skyZenith)
    const b = display(lightingPresets.day.skyZenith)
    expect(Math.abs(sample.colors.skyZenith[0]! - (a[0]! + b[0]!) / 2)).toBeGreaterThan(0.0005)
  })

  it('updates the caller’s fixed buffers in place', () => {
    const colors = sample.colors.skyHorizon
    const direction = sample.direction
    timeOfDay(330, sample)
    expect(sample.colors.skyHorizon).toBe(colors)
    expect(sample.direction).toBe(direction)
    expect(Math.hypot(...direction)).toBeCloseTo(1)
    expect(sample.nightAmount).toBeGreaterThan(0)
    expect(sample.nightAmount).toBeLessThan(1)
  })
})
