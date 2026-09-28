import { lightingPresets, type LightingPreset } from '../styles/tokens'
import { wrapMinutes } from './gameClock'

/** The clock's visual anchors. The repeated night keys hold its darkest mood across midnight. */
export const TIME_KEYS = [
  { minute: 0, phase: 'night' },
  { minute: 210, phase: 'night' },
  { minute: 420, phase: 'morning' },
  { minute: 720, phase: 'day' },
  { minute: 990, phase: 'afternoon' },
  { minute: 1110, phase: 'goldenHour' },
  { minute: 1170, phase: 'dusk' },
  { minute: 1320, phase: 'night' },
  { minute: 1440, phase: 'night' },
] as const

export type LightColorRole =
  | 'skyZenith'
  | 'skyHorizon'
  | 'sunGlow'
  | 'fog'
  | 'sun'
  | 'ambientSky'
  | 'ambientGround'
  | 'cloudLight'
  | 'cloudShadow'
  | 'gradeShadow'
  | 'gradeHighlight'
export const LIGHT_COLOR_ROLES: readonly LightColorRole[] = [
  'skyZenith',
  'skyHorizon',
  'sunGlow',
  'fog',
  'sun',
  'ambientSky',
  'ambientGround',
  'cloudLight',
  'cloudShadow',
  'gradeShadow',
  'gradeHighlight',
]

export interface BlendedLighting {
  /** Display sRGB triplets; light materials convert these to linear at the boundary. */
  colors: Record<LightColorRole, Float32Array>
  direction: Float32Array
  sunIntensity: number
  hemisphereIntensity: number
  gradeShadowAmount: number
  gradeHighlightAmount: number
  nightAmount: number
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/** OKLab conversion from linear sRGB; components use the standard D65 matrices. */
function toLab(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = srgbToLinear(((n >> 16) & 255) / 255)
  const g = srgbToLinear(((n >> 8) & 255) / 255)
  const b = srgbToLinear((n & 255) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const compiled = Object.fromEntries(
  Object.entries(lightingPresets).map(([name, preset]) => [
    name,
    Object.fromEntries(LIGHT_COLOR_ROLES.map((role) => [role, toLab(preset[role])])),
  ]),
) as Record<keyof typeof lightingPresets, Record<LightColorRole, readonly [number, number, number]>>

function fromLab(a: readonly number[], b: readonly number[], t: number, out: Float32Array): void {
  const L = (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t
  const A = (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t
  const B = (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  out[0] = Math.max(
    0,
    Math.min(1, linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
  )
  out[1] = Math.max(
    0,
    Math.min(1, linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
  )
  out[2] = Math.max(
    0,
    Math.min(1, linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  )
}

export function createBlendedLighting(): BlendedLighting {
  return {
    colors: Object.fromEntries(
      LIGHT_COLOR_ROLES.map((role) => [role, new Float32Array(3)]),
    ) as Record<LightColorRole, Float32Array>,
    direction: new Float32Array(3),
    sunIntensity: 0,
    hemisphereIntensity: 0,
    gradeShadowAmount: 0,
    gradeHighlightAmount: 0,
    nightAmount: 0,
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const nightOf = (phase: string) => (phase === 'night' ? 1 : phase === 'dusk' ? 0.35 : 0)

/** Eased, C1-continuous at each keyframe; output storage belongs to the caller. No frame allocations. */
export function timeOfDay(minutes: number, out: BlendedLighting): BlendedLighting {
  const minute = wrapMinutes(minutes)
  let i = 0
  while (i < TIME_KEYS.length - 2 && minute >= TIME_KEYS[i + 1]!.minute) i++
  const left = TIME_KEYS[i]!
  const right = TIME_KEYS[i + 1]!
  const x = (minute - left.minute) / (right.minute - left.minute)
  const t = x * x * (3 - 2 * x)
  const a: LightingPreset = lightingPresets[left.phase]
  const b: LightingPreset = lightingPresets[right.phase]
  for (const role of LIGHT_COLOR_ROLES) {
    fromLab(compiled[left.phase][role], compiled[right.phase][role], t, out.colors[role])
  }
  const dir = out.direction
  let length = 0
  for (let axis = 0; axis < 3; axis++) {
    const value = lerp(a.sunDirection[axis]!, b.sunDirection[axis]!, t)
    dir[axis] = value
    length += value * value
  }
  length = Math.sqrt(length) || 1
  for (let axis = 0; axis < 3; axis++) dir[axis] = dir[axis]! / length
  out.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t)
  out.hemisphereIntensity = lerp(a.hemisphereIntensity, b.hemisphereIntensity, t)
  out.gradeShadowAmount = lerp(a.gradeShadowAmount, b.gradeShadowAmount, t)
  out.gradeHighlightAmount = lerp(a.gradeHighlightAmount, b.gradeHighlightAmount, t)
  out.nightAmount = lerp(nightOf(left.phase), nightOf(right.phase), t)
  return out
}
