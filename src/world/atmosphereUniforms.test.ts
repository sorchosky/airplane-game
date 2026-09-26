import { Color, ShaderMaterial, UniformsUtils } from 'three'
import { describe, expect, it } from 'vitest'
import { lightingPresets } from '../styles/tokens'
import { applyLighting, atmosphereUniforms, sunDirectionOf } from './atmosphereUniforms'

function hexToDisplay(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255)
}

describe('applyLighting', () => {
  it('writes sky and haze colours as display sRGB and the sun light as linear', () => {
    const preset = lightingPresets.goldenHour
    applyLighting(preset)
    const zenith = Array.from(atmosphereUniforms.atmoZenith.value)
    hexToDisplay(preset.skyZenith).forEach((c, i) => expect(zenith[i]).toBeCloseTo(c, 4))
    const haze = Array.from(atmosphereUniforms.atmoHaze.value)
    hexToDisplay(preset.fog).forEach((c, i) => expect(haze[i]).toBeCloseTo(c, 4))

    const linear = new Color(preset.sun)
    const sun = atmosphereUniforms.atmoSunLight.value
    expect(sun[0]).toBeCloseTo(linear.r, 5)
    expect(sun[1]).toBeCloseTo(linear.g, 5)
    expect(sun[2]).toBeCloseTo(linear.b, 5)
    applyLighting(lightingPresets.morning)
  })

  it('writes a unit sun direction', () => {
    applyLighting(lightingPresets.morning)
    const [x, y, z] = atmosphereUniforms.atmoSunDir.value
    expect(Math.hypot(x ?? 0, y ?? 0, z ?? 0)).toBeCloseTo(1, 5)
    expect(Array.from(atmosphereUniforms.atmoSunDir.value)).toEqual(
      sunDirectionOf(lightingPresets.morning).map((v) => Math.fround(v)),
    )
  })

  it('writes in place, so the arrays materials hold stay the same objects', () => {
    const before = atmosphereUniforms.atmoHorizon.value
    applyLighting(lightingPresets.goldenHour)
    expect(atmosphereUniforms.atmoHorizon.value).toBe(before)
    applyLighting(lightingPresets.morning)
  })

  // The design rests on this: three copies a material's uniforms when it is built, but keeps typed
  // arrays by reference. If a three upgrade changes that, one write stops reaching every material.
  it('reaches a material built from the uniforms after a later write', () => {
    const material = new ShaderMaterial({ uniforms: UniformsUtils.clone(atmosphereUniforms) })
    const held = material.uniforms.atmoZenith?.value as Float32Array
    applyLighting(lightingPresets.goldenHour)
    expect(held).toBe(atmosphereUniforms.atmoZenith.value)
    expect(held[0]).toBeCloseTo(hexToDisplay(lightingPresets.goldenHour.skyZenith)[0] ?? 0, 4)
    applyLighting(lightingPresets.morning)
    material.dispose()
  })
})
