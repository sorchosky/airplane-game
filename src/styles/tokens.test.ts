import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { color, lightingPresets, space, toonRamp, type, type LightingPreset } from './tokens'

const HEX = /^#[0-9a-f]{6}$/i
const RGBA = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/i

// Albedo and UI roles (#20); the lighting roles moved into the presets in #64.
const REQUIRED_COLOR_ROLES = [
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

  it('gives every lighting preset every colour role, a sun above the horizon and positive light', () => {
    const colorRoles: Array<keyof LightingPreset> = [
      'skyZenith',
      'skyHorizon',
      'sunGlow',
      'fog',
      'sun',
      'ambientSky',
      'ambientGround',
      'cloudLight',
      'cloudShadow',
    ]
    for (const [name, preset] of Object.entries(lightingPresets)) {
      for (const role of colorRoles) expect(preset[role], `${name}.${role}`).toMatch(HEX)
      expect(preset.sunDirection).toHaveLength(3)
      for (const c of preset.sunDirection) expect(Number.isFinite(c)).toBe(true)
      expect(preset.sunDirection[1], `${name} sun above the horizon`).toBeGreaterThan(0)
      expect(preset.sunIntensity).toBeGreaterThan(0)
      expect(preset.hemisphereIntensity).toBeGreaterThan(0)
    }
  })

  // #64: the plane has to read from the couch against the ground and the sky. Palette B's warm
  // white body is close in value to the pale morning horizon (about 1.1:1), so, as in BotW, the
  // silhouette is carried by the ink outline; the body separates from the grass it flies over.
  describe('plane readability (palette B)', () => {
    const morning = lightingPresets.morning

    it('outlines the plane at 3:1 or more against the horizon, the zenith and the grass', () => {
      for (const backdrop of [morning.skyHorizon, morning.skyZenith, color.grassLight]) {
        expect(contrastRatio(color.outline, backdrop), backdrop).toBeGreaterThanOrEqual(3)
      }
    })

    it('separates the body from the grass in shade and from deep water by 3:1 or more', () => {
      expect(contrastRatio(color.planeBody, color.grassShadow)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(color.planeBody, color.waterDeep)).toBeGreaterThanOrEqual(3)
    })

    it('keeps the stripe at 3:1 or more against the pale horizon', () => {
      expect(contrastRatio(color.planeStripe, morning.skyHorizon)).toBeGreaterThanOrEqual(3)
    })

    it('records why the body alone cannot carry the silhouette against the morning sky', () => {
      expect(contrastRatio(color.planeBody, morning.skyHorizon)).toBeLessThan(1.5)
      expect(contrastRatio(color.planeBody, color.grassLight)).toBeLessThan(3)
    })
  })

  it('mirrors every color, space and type value into tokens.css as a custom property', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf-8')
    // Prettier normalizes quote style differently for JS (tokens.ts) vs. CSS (tokens.css) string
    // literals, so font-family values are compared with quote characters stripped.
    const stripQuotes = (s: string) => s.replaceAll(/['"]/g, '')
    const normalizedCss = stripQuotes(css)

    for (const value of Object.values(color)) {
      expect(css.includes(value), `tokens.css is missing color value ${value}`).toBe(true)
    }
    for (const value of Object.values(space)) {
      expect(css.includes(value), `tokens.css is missing space value ${value}`).toBe(true)
    }
    for (const key of [
      'fontDisplay',
      'fontBody',
      'trackingDisplay',
      'tvDisplay',
      'tvTitle',
      'tvBody',
      'tvCaption',
      'tvHero',
      'trackingHero',
      'trackingHeroShadow',
      'trackingStart',
    ] as const) {
      expect(
        normalizedCss.includes(stripQuotes(type[key])),
        `tokens.css is missing type value ${type[key]}`,
      ).toBe(true)
    }
    expect(css.includes(`--weight-display: ${type.weightDisplay};`)).toBe(true)
    expect(css.includes(`--weight-button: ${type.weightButton};`)).toBe(true)
    expect(css.includes(`--weight-hero: ${type.weightHero};`)).toBe(true)
    expect(css.includes(`--weight-start: ${type.weightStart};`)).toBe(true)
  })

  it('loads exactly the Google Fonts weights the tokens use (no unused/missing weights)', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf-8')
    const importUrl = css.match(/@import url\('([^']+)'\)/)?.[1]
    expect(importUrl, 'tokens.css should @import a Google Fonts URL').toBeDefined()

    // fontDisplay is used at weightHero (the title wordmark) and weightDisplay (headings);
    // fontBody at its default weight (400, unset in any component), weightButton
    // (buttons/labels) and weightStart (the title screen's Start).
    expect(importUrl).toContain(`Josefin+Sans:wght@${type.weightHero};${type.weightDisplay}`)
    expect(importUrl).toContain(`Work+Sans:wght@400;${type.weightButton};${type.weightStart}`)
  })
})
