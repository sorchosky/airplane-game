import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { color, lighting, space, toonRamp, type } from './tokens'

const HEX = /^#[0-9a-f]{6}$/i
const RGBA = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/i

// The exact semantic roles required by #20's acceptance criteria.
const REQUIRED_COLOR_ROLES = [
  'skyZenith',
  'skyHorizon',
  'fog',
  'sun',
  'grassLight',
  'grassShadow',
  'rock',
  'snow',
  'waterShallow',
  'waterDeep',
  'foliage',
  'outline',
  'planeBody',
  'planeStripe',
  'planeMetal',
  'controlActive',
  'controlInactive',
  'surfaceHud',
  'textPrimary',
  'textMuted',
  'accent',
] as const

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const rl = srgbToLinear(Number.parseInt(hex.slice(1, 3), 16))
  const gl = srgbToLinear(Number.parseInt(hex.slice(3, 5), 16))
  const bl = srgbToLinear(Number.parseInt(hex.slice(5, 7), 16))
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  return (Math.max(lA, lB) + 0.05) / (Math.min(lA, lB) + 0.05)
}

/** Flattens `surfaceHud`'s alpha onto an opaque backdrop for a contrast check. */
function compositeOverSurfaceHud(backdropHex: string): string {
  const match = color.surfaceHud.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)
  if (!match) throw new Error('surfaceHud is not an rgba() string')
  const [wholeMatch, rStr, gStr, bStr, aStr] = match
  if (!wholeMatch || !rStr || !gStr || !bStr || !aStr)
    throw new Error('surfaceHud regex capture failed')
  const alpha = Number(aStr)
  const composite = (fgChannel: string, backdropSlice: string) =>
    Math.round(Number(fgChannel) * alpha + Number.parseInt(backdropSlice, 16) * (1 - alpha))
  const outR = composite(rStr, backdropHex.slice(1, 3))
  const outG = composite(gStr, backdropHex.slice(3, 5))
  const outB = composite(bStr, backdropHex.slice(5, 7))
  return `#${[outR, outG, outB].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

describe('design tokens', () => {
  it('defines every semantic color role required by the art direction ticket', () => {
    for (const role of REQUIRED_COLOR_ROLES) {
      const value = color[role]
      expect(value, `color.${role}`).toBeDefined()
      expect(value, `color.${role} should be a hex or rgba() string`).toMatch(
        role === 'surfaceHud' ? RGBA : HEX,
      )
    }
  })

  it('lays spacing out on an 8pt grid', () => {
    for (const value of Object.values(space)) {
      const px = Number.parseInt(value, 10)
      expect(px % 4).toBe(0)
    }
  })

  it('sizes the TV type scale with viewport-relative units', () => {
    for (const key of ['tvDisplay', 'tvTitle', 'tvBody', 'tvCaption'] as const) {
      expect(type[key]).toMatch(/clamp\(/)
    }
  })

  it('keeps tv-body at or above the 10-foot-UI legibility floor (24px)', () => {
    const [, minRem] = type.tvBody.match(/clamp\(([\d.]+)rem/) ?? []
    expect(Number(minRem)).toBeGreaterThanOrEqual(1.5)
  })

  it('meets WCAG AA (4.5:1) for HUD text over surface-hud, even over the brightest terrain backdrop', () => {
    const worstCaseBackdrop = color.snow // brightest token likely to sit behind a translucent HUD panel
    const compositedHud = compositeOverSurfaceHud(worstCaseBackdrop)
    expect(contrastRatio(color.textPrimary, compositedHud)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(color.textMuted, compositedHud)).toBeGreaterThanOrEqual(4.5)
  })

  it('defines a 3-band toon ramp with ascending thresholds inside (0, 1)', () => {
    expect(toonRamp.steps).toBe(toonRamp.thresholds.length + 1)
    for (const threshold of toonRamp.thresholds) {
      expect(threshold).toBeGreaterThan(0)
      expect(threshold).toBeLessThan(1)
    }
    expect(toonRamp.thresholds[0]).toBeLessThan(toonRamp.thresholds[1])
  })

  it('gives the sun direction three finite components', () => {
    expect(lighting.sunDirection).toHaveLength(3)
    for (const component of lighting.sunDirection) {
      expect(Number.isFinite(component)).toBe(true)
    }
  })

  it('mirrors every color, space and type value into tokens.css as a custom property', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf-8')

    for (const value of Object.values(color)) {
      expect(css.includes(value), `tokens.css is missing color value ${value}`).toBe(true)
    }
    for (const value of Object.values(space)) {
      expect(css.includes(value), `tokens.css is missing space value ${value}`).toBe(true)
    }
    for (const key of ['tvDisplay', 'tvTitle', 'tvBody', 'tvCaption'] as const) {
      expect(css.includes(type[key]), `tokens.css is missing type value ${type[key]}`).toBe(true)
    }
  })
})
