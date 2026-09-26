import { NearestFilter, RedFormat } from 'three'
import { describe, expect, it } from 'vitest'
import { color, toonRamp } from '../styles/tokens'
import {
  TOON_BAND_LEVELS,
  TOON_RAMP_WIDTH,
  buildToonRampData,
  createToonMaterial,
  getOutlineMaterial,
  getToonGradientMap,
  outlineOffset,
  toonMaterialKey,
  toonRampValue,
} from './toon'

describe('toonRampValue', () => {
  const [low, high] = toonRamp.thresholds
  const e = toonRamp.edgeSoftness

  it('is flat inside each band', () => {
    expect(toonRampValue(-1)).toBeCloseTo(TOON_BAND_LEVELS[0])
    expect(toonRampValue(low - e - 0.01)).toBeCloseTo(TOON_BAND_LEVELS[0])
    expect(toonRampValue((low + high) / 2)).toBeCloseTo(TOON_BAND_LEVELS[1])
    expect(toonRampValue(high + e + 0.01)).toBeCloseTo(TOON_BAND_LEVELS[2])
    expect(toonRampValue(1)).toBeCloseTo(TOON_BAND_LEVELS[2])
  })

  it('crosses each threshold halfway between bands', () => {
    expect(toonRampValue(low)).toBeCloseTo((TOON_BAND_LEVELS[0] + TOON_BAND_LEVELS[1]) / 2)
    expect(toonRampValue(high)).toBeCloseTo((TOON_BAND_LEVELS[1] + TOON_BAND_LEVELS[2]) / 2)
  })

  it('never decreases as N·L rises', () => {
    let previous = -Infinity
    for (let n = -1; n <= 1; n += 0.01) {
      const value = toonRampValue(n)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
})

describe('buildToonRampData', () => {
  it('maps texels to N·L the way three samples the gradient map', () => {
    const data = buildToonRampData()
    expect(data).toHaveLength(TOON_RAMP_WIDTH)
    expect(data[0]).toBe(Math.round(TOON_BAND_LEVELS[0] * 255))
    expect(data[TOON_RAMP_WIDTH - 1]).toBe(255)
    // u = N·L * 0.5 + 0.5, so the middle band sits between the thresholds' texels.
    const midU = ((toonRamp.thresholds[0] + toonRamp.thresholds[1]) / 2) * 0.5 + 0.5
    expect(data[Math.floor(midU * TOON_RAMP_WIDTH)]).toBe(Math.round(TOON_BAND_LEVELS[1] * 255))
  })
})

describe('getToonGradientMap', () => {
  it('is one shared nearest-filtered, unmipmapped single-channel texture', () => {
    const map = getToonGradientMap()
    expect(getToonGradientMap()).toBe(map)
    expect(map.minFilter).toBe(NearestFilter)
    expect(map.magFilter).toBe(NearestFilter)
    expect(map.generateMipmaps).toBe(false)
    expect(map.format).toBe(RedFormat)
  })
})

describe('createToonMaterial', () => {
  it('returns one cached material per color and options', () => {
    const a = createToonMaterial({ color: color.rock })
    expect(createToonMaterial({ color: color.rock })).toBe(a)
    expect(createToonMaterial({ color: color.rock, rim: true })).not.toBe(a)
    expect(createToonMaterial({ color: color.snow })).not.toBe(a)
    expect(a.gradientMap).toBe(getToonGradientMap())
  })

  it('normalizes equivalent color spellings to one key', () => {
    expect(toonMaterialKey({ color: '#ffffff' })).toBe(toonMaterialKey({ color: 0xffffff }))
    expect(toonMaterialKey({ color: '#fff', rim: false })).toBe(toonMaterialKey({ color: 'white' }))
  })

  it('only patches the shader when rim light is on', () => {
    const plain = createToonMaterial({ color: color.planeBody })
    const rim = createToonMaterial({ color: color.planeBody, rim: true })
    expect(plain.customProgramCacheKey()).not.toBe(rim.customProgramCacheKey())
    const shader = {
      uniforms: {},
      fragmentShader: 'void main() {\n\t#include <opaque_fragment>\n}',
      vertexShader: '',
    }
    rim.onBeforeCompile(shader as never, undefined as never)
    expect(shader.fragmentShader).toContain('toonRimStrength')
    expect(shader.fragmentShader).toContain('#include <opaque_fragment>')
    expect(shader.uniforms).toHaveProperty('toonRimColor')
  })

  it('adds a stepped specular term, alone or with the rim, each its own program', () => {
    const plain = createToonMaterial({ color: color.planeGlass })
    const spec = createToonMaterial({ color: color.planeGlass, specular: true })
    const both = createToonMaterial({ color: color.planeGlass, specular: true, rim: true })
    expect(spec).not.toBe(plain)
    const keys = new Set([plain, spec, both].map((m) => m.customProgramCacheKey()))
    expect(keys.size).toBe(3)
    const shader = {
      uniforms: {},
      fragmentShader: 'void main() {\n\t#include <opaque_fragment>\n}',
      vertexShader: '',
    }
    both.onBeforeCompile(shader as never, undefined as never)
    expect(shader.fragmentShader).toContain('toonGlint')
    expect(shader.fragmentShader).toContain('toonRimStrength')
    expect(shader.fragmentShader).toContain('#include <opaque_fragment>')
    expect(shader.uniforms).toHaveProperty('toonSpecular')
  })

  it('turns on vertex colours only when asked', () => {
    expect(createToonMaterial({ color: color.planeBody }).vertexColors).toBe(false)
    const shaded = createToonMaterial({ color: color.planeBody, vertexColors: true })
    expect(shaded.vertexColors).toBe(true)
    expect(shaded).not.toBe(createToonMaterial({ color: color.planeBody }))
  })
})

describe('outline', () => {
  // 60° vertical fov on a 1080 px tall viewport.
  const scaleY = 1 / Math.tan(Math.PI / 6)
  const height = 1080

  it('uses the world thickness once the object is far enough away', () => {
    expect(outlineOffset(0.04, 3, 100, scaleY, height)).toBeCloseTo(0.04)
  })

  it('caps the on-screen width for objects close to the camera', () => {
    const offset = outlineOffset(0.04, 3, 1, scaleY, height)
    const pixels = offset / ((2 * 1) / (scaleY * height))
    expect(offset).toBeLessThan(0.04)
    expect(pixels).toBeCloseTo(3)
  })

  it('gets thinner on screen with distance', () => {
    const pixelsAt = (depth: number) =>
      outlineOffset(0.04, 3, depth, scaleY, height) / ((2 * depth) / (scaleY * height))
    expect(pixelsAt(200)).toBeLessThan(pixelsAt(50))
    expect(pixelsAt(50)).toBeLessThanOrEqual(pixelsAt(5))
  })

  it('shares one back-face material per color and weight, defaulting to the outline token', () => {
    const a = getOutlineMaterial()
    expect(getOutlineMaterial({ color: color.outline })).toBe(a)
    expect(getOutlineMaterial({ thickness: 0.1 })).not.toBe(a)
    expect(`#${a.uniforms.color?.value.getHexString()}`).toBe(color.outline)
    expect(a.uniforms.viewportHeight).toBe(
      getOutlineMaterial({ thickness: 0.1 }).uniforms.viewportHeight,
    )
  })
})
