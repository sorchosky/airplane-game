import { describe, expect, it } from 'vitest'
import { color, lightingPresets } from '../styles/tokens'
import {
  frontDoorBlurActive,
  frontDoorComposite,
  frontDoorScrim,
  godRayFade,
  gradeColor,
  gradeParams,
  hexToRgb,
  luma,
  parseRgba,
  POST_FX,
  postFxConfig,
  vignetteFactor,
  type Rgb,
} from './postFx'
import { getFxFlag } from './qualityStore'

describe('postFxConfig', () => {
  it('low disables post entirely', () => {
    expect(postFxConfig('low').enabled).toBe(false)
  })

  it('medium is bloom only, at half resolution', () => {
    expect(postFxConfig('medium')).toEqual({
      enabled: true,
      bloomResolutionScale: 0.5,
      grade: false,
      vignette: false,
      godRays: false,
    })
  })

  it('high is everything at full resolution', () => {
    expect(postFxConfig('high')).toEqual({
      enabled: true,
      bloomResolutionScale: 1,
      grade: true,
      vignette: true,
      godRays: true,
    })
  })

  it('draws god rays on high only, and never under reduced motion', () => {
    expect(postFxConfig('high', { reducedMotion: true }).godRays).toBe(false)
    expect(postFxConfig('high', { reducedMotion: true }).grade).toBe(true)
    for (const tier of ['low', 'medium'] as const) {
      expect(postFxConfig(tier, { reducedMotion: false }).godRays).toBe(false)
    }
  })

  it('follows the ?fx= override', () => {
    expect(postFxConfig(getFxFlag('?fx=off') ?? 'high').enabled).toBe(false)
    expect(postFxConfig(getFxFlag('?fx=medium') ?? 'high').grade).toBe(false)
    expect(postFxConfig(getFxFlag('?fx=high') ?? 'low').godRays).toBe(true)
  })
})

describe('POST_FX', () => {
  it('keeps the bloom threshold high enough that only highlights glow', () => {
    // Most of the sky is ~0.38 and sunlit terrain/plane ~0.25 linear luminance; bloom, knee
    // included, must start above both so only the sun and its glow bloom.
    expect(POST_FX.bloom.threshold - POST_FX.bloom.smoothing).toBeGreaterThan(0.3)
  })

  it('uses the lighter vignette and a +4 % saturation', () => {
    expect(POST_FX.vignette).toEqual({ offset: 0.4, darkness: 0.25 })
    expect(POST_FX.grade.saturation).toBeCloseTo(0.04)
  })
})

// Colours a frame is mostly made of: terrain albedo, the plane, and each preset's sky and haze.
function frameColors(): Rgb[] {
  const albedo = [
    color.grassLight,
    color.grassShadow,
    color.sand,
    color.rock,
    color.rockShadow,
    color.snow,
    color.waterShallow,
    color.waterDeep,
    color.foliage,
    color.foliageLight,
    color.planeBody,
    color.planeStripe,
    color.outline,
  ]
  const sky = Object.values(lightingPresets).flatMap((p) => [
    p.skyZenith,
    p.skyHorizon,
    p.sunGlow,
    p.fog,
    p.cloudLight,
    p.cloudShadow,
  ])
  return [...albedo, ...sky].map(hexToRgb)
}

describe('two-tone grade', () => {
  const presets = Object.entries(lightingPresets)

  it('leans shadows teal and highlights warm under every preset', () => {
    for (const [name, preset] of presets) {
      const p = gradeParams(preset)
      const shadow = gradeColor([0.15, 0.15, 0.15], p)
      expect(shadow[2] - shadow[0], `${name} shadow`).toBeGreaterThan(0)
      expect(shadow[1] - shadow[0], `${name} shadow`).toBeGreaterThan(0)
      const highlight = gradeColor([0.85, 0.85, 0.85], p)
      expect(highlight[0] - highlight[2], `${name} highlight`).toBeGreaterThan(0)
    }
  })

  it('stays subtle: no channel moves more than 0.06', () => {
    for (const [name, preset] of presets) {
      const p = gradeParams(preset)
      for (const c of frameColors()) {
        const graded = gradeColor(c, p)
        for (let i = 0; i < 3; i++) {
          expect(Math.abs((graded[i] ?? 0) - (c[i] ?? 0)), `${name} ${c.join(',')}`).toBeLessThan(
            0.06,
          )
        }
      }
    }
  })

  it('keeps each colour’s luma within 1 %', () => {
    for (const [name, preset] of presets) {
      const p = gradeParams(preset)
      for (const c of frameColors()) {
        expect(Math.abs(luma(gradeColor(c, p)) - luma(c)), `${name} ${c.join(',')}`).toBeLessThan(
          0.01 * Math.max(luma(c), 0.05),
        )
      }
    }
  })

  // The E3 governor steps between medium and high mid-flight, so high's grade and vignette must
  // not visibly brighten or darken the frame: average brightness within 2 % of medium's.
  it('matches medium’s average brightness within 2 %, vignette included', () => {
    const grid = 32
    for (const [name, preset] of presets) {
      const p = gradeParams(preset)
      let medium = 0
      let high = 0
      for (const c of frameColors()) {
        const graded = luma(gradeColor(c, p))
        for (let y = 0; y < grid; y++) {
          for (let x = 0; x < grid; x++) {
            const v = vignetteFactor(
              (x + 0.5) / grid,
              (y + 0.5) / grid,
              POST_FX.vignette.offset,
              POST_FX.vignette.darkness,
            )
            medium += luma(c)
            high += graded * v
          }
        }
      }
      expect(Math.abs(high / medium - 1), name).toBeLessThan(0.02)
    }
  })
})

describe('vignetteFactor', () => {
  it('leaves the centre alone and darkens the corners only a little', () => {
    const { offset, darkness } = POST_FX.vignette
    expect(vignetteFactor(0.5, 0.5, offset, darkness)).toBe(1)
    expect(vignetteFactor(0.5, 0, offset, darkness)).toBeGreaterThan(0.99)
    const corner = vignetteFactor(0, 0, offset, darkness)
    expect(corner).toBeGreaterThan(0.7)
    expect(corner).toBeLessThan(0.9)
  })
})

describe('godRayFade', () => {
  it('is full with the sun on screen ahead', () => {
    expect(godRayFade(0.9, 0.5, 0.6)).toBe(1)
  })

  it('is off with the sun behind the camera', () => {
    expect(godRayFade(-0.5, 0.5, 0.5)).toBe(0)
    expect(godRayFade(0, 0.5, 0.5)).toBe(0)
  })

  it('fades out smoothly as the sun leaves the screen', () => {
    const at = [0.5, 0.7, 0.9, 1.1, 1.3, 1.7].map((u) => godRayFade(0.9, u, 0.5))
    expect(at[0]).toBe(1)
    expect(at[1]).toBe(1)
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeLessThanOrEqual(at[i - 1] ?? 1)
    expect(at.at(-1)).toBe(0)
  })
})

describe('front door blur', () => {
  const scene: Rgb = [0.8, 0.4, 0.1]
  const blurred: Rgb = [0.5, 0.5, 0.5]

  it('parses the scrim token', () => {
    expect(parseRgba('rgba(12, 18, 26, 0.6)')).toEqual({
      rgb: [12 / 255, 18 / 255, 26 / 255],
      alpha: 0.6,
    })
    expect(parseRgba('rgb(255, 0, 0)').alpha).toBe(1)
    expect(() => parseRgba('#ffffff')).toThrow()
  })

  it('uses the cool front-door scrim, a 20 % desaturation, and a quarter-resolution blur', () => {
    expect(POST_FX.frontDoorBlur.scrim).toBe(color.frontDoorScrim)
    expect(POST_FX.frontDoorBlur.desaturation).toBe(0.2)
    expect(POST_FX.frontDoorBlur.resolutionScale).toBe(0.25)
    expect(frontDoorScrim().alpha).toBe(0.7)
  })

  it('costs nothing at strength 0', () => {
    expect(frontDoorBlurActive(0)).toBe(false)
    expect(frontDoorBlurActive(0.0005)).toBe(false)
    expect(frontDoorBlurActive(0.01)).toBe(true)
    expect(frontDoorComposite(scene, blurred, 0)).toEqual(scene)
  })

  it('at full strength is the blur, desaturated and under the scrim', () => {
    const out = frontDoorComposite(scene, blurred, 1)
    // A grey blurred pixel has nothing to desaturate, so it only moves toward the scrim.
    const { tint, alpha } = frontDoorScrim()
    expect(out[0]).toBeCloseTo(0.5 + (tint[0] - 0.5) * alpha)
    expect(out[2]).toBeCloseTo(0.5 + (tint[2] - 0.5) * alpha)
  })

  it('moves smoothly with strength', () => {
    let previous = luma(frontDoorComposite(scene, blurred, 0))
    for (let s = 0.1; s <= 1.0001; s += 0.1) {
      const l = luma(frontDoorComposite(scene, blurred, s))
      expect(Math.abs(l - previous)).toBeLessThan(0.1)
      previous = l
    }
  })

  it('pulls a saturated blurred colour toward its luma by 20 % of the strength', () => {
    const vivid: Rgb = [0.9, 0.1, 0.1]
    const out = frontDoorComposite(vivid, vivid, 1)
    const { tint, alpha } = frontDoorScrim()
    const l = luma(vivid)
    const desat0 = vivid[0] + (l - vivid[0]) * 0.2
    expect(out[0]).toBeCloseTo(desat0 + (tint[0] - desat0) * alpha)
  })
})
