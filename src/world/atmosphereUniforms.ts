import { Color, SRGBColorSpace } from 'three'
import type { LightingPreset } from '../styles/tokens'
import { activeLighting } from './lightingPreset'

/**
 * The lighting preset as shader uniforms, shared by every material that draws sky, haze or sun
 * light (#64). Each value is a `Float32Array`: three.js copies a material's uniform objects when it
 * compiles, but keeps typed arrays by reference, so one write here reaches every material at once.
 * That is what lets `?tod=` pick a preset without recompiling, and lets the day cycle (#92) blend
 * presets every frame.
 *
 * Sky and haze colours are display sRGB, like the sky itself (see `atmosphereShader.ts`); the sun's
 * light colour is linear, for materials that light in linear space (water glints, rim light).
 */
export interface AtmosphereUniforms {
  [name: string]: { value: Float32Array }
  atmoZenith: { value: Float32Array }
  atmoHorizon: { value: Float32Array }
  atmoHaze: { value: Float32Array }
  atmoSunGlow: { value: Float32Array }
  atmoSunDisc: { value: Float32Array }
  atmoSunDir: { value: Float32Array }
  atmoSunLight: { value: Float32Array }
}

const vec3 = () => ({ value: new Float32Array(3) })

export const atmosphereUniforms: AtmosphereUniforms = {
  atmoZenith: vec3(),
  atmoHorizon: vec3(),
  atmoHaze: vec3(),
  atmoSunGlow: vec3(),
  atmoSunDisc: vec3(),
  atmoSunDir: vec3(),
  atmoSunLight: vec3(),
}

const scratch = new Color()

function writeDisplay(target: Float32Array, hex: string): void {
  const { r, g, b } = scratch.set(hex).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace)
  target[0] = r
  target[1] = g
  target[2] = b
}

function writeLinear(target: Float32Array, hex: string): void {
  scratch.set(hex)
  target[0] = scratch.r
  target[1] = scratch.g
  target[2] = scratch.b
}

/** The sun disc: near-white, a touch warmer than the snow token. */
const SUN_DISC = '#fffaf0'

/** Unit vector toward the sun. */
export function sunDirectionOf(preset: LightingPreset): [number, number, number] {
  const [x, y, z] = preset.sunDirection
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length]
}

/** Writes `preset` into the shared uniforms. Allocation-free after the first call. */
export function applyLighting(preset: LightingPreset): void {
  const u = atmosphereUniforms
  writeDisplay(u.atmoZenith.value, preset.skyZenith)
  writeDisplay(u.atmoHorizon.value, preset.skyHorizon)
  writeDisplay(u.atmoHaze.value, preset.fog)
  writeDisplay(u.atmoSunGlow.value, preset.sunGlow)
  writeDisplay(u.atmoSunDisc.value, SUN_DISC)
  writeLinear(u.atmoSunLight.value, preset.sun)
  const [x, y, z] = sunDirectionOf(preset)
  u.atmoSunDir.value[0] = x
  u.atmoSunDir.value[1] = y
  u.atmoSunDir.value[2] = z
}

applyLighting(activeLighting())
