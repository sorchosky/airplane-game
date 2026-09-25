import { Color, ShaderChunk, SRGBColorSpace } from 'three'
import { color } from '../styles/tokens'
import { SUN_DIRECTION } from './atmosphere'
import { TERRAIN_CONFIG } from './terrainConfig'

// GLSL for the sky and the distance haze. Both call the same `atmosphereSky` function, which is
// what guarantees there is no seam: a fully hazed hill is the exact colour of the sky behind it.
//
// Three.js applies fog as the very last step of every built-in material, after tone mapping and
// the sRGB conversion, so the colours below are plain sRGB (straight from the token hex) and the
// sky shader writes them out untouched. That keeps the sky and the haze on the same footing.

function glslVec3(values: readonly number[]): string {
  return `vec3(${values.map((v) => v.toFixed(5)).join(', ')})`
}

function srgb(hex: string): string {
  const { r, g, b } = new Color(hex).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace)
  return glslVec3([r, g, b])
}

function glslFloat(value: number): string {
  return value.toFixed(6)
}

const config = TERRAIN_CONFIG

/** Constants and `atmosphereSky(dir)`, the sky colour (minus the sun disc) along a world direction. */
export const ATMOSPHERE_GLSL = /* glsl */ `
const vec3 ATMO_ZENITH = ${srgb(color.skyZenith)};
const vec3 ATMO_HORIZON = ${srgb(color.skyHorizon)};
const vec3 ATMO_HAZE_WARM = ${srgb(color.fog)};
const vec3 ATMO_SUN = ${srgb(color.sun)};
const vec3 ATMO_SUN_DISC = ${srgb(color.snow)};
const vec3 ATMO_SUN_DIR = ${glslVec3(SUN_DIRECTION)};
const float ATMO_COOL_SHIFT = ${glslFloat(config.hazeCoolShift)};
const float ATMO_HAZE_DENSITY = ${glslFloat(config.hazeDensity)};
const float ATMO_HAZE_WARM_MAX = ${glslFloat(config.hazeWarmMax)};
const float ATMO_FADE_START = ${glslFloat(config.hazeFadeStart)};
const float ATMO_FADE_END = ${glslFloat(config.hazeFadeEnd)};

vec3 atmosphereSky(vec3 dir) {
  // Below the horizon the sky is the horizon colour, so terrain fading at the edge meets it.
  float elevation = clamp(dir.y, 0.0, 1.0);

  // Horizon tint: warm facing the sun, cooler (toward the zenith colour) facing away from it.
  vec2 level = dir.xz;
  float levelLength = length(level);
  float towardSun = levelLength > 1e-4 ? dot(level / levelLength, normalize(ATMO_SUN_DIR.xz)) : 0.0;
  vec3 coolHorizon = mix(ATMO_HORIZON, ATMO_ZENITH, ATMO_COOL_SHIFT);
  vec3 horizon = mix(coolHorizon, ATMO_HORIZON, smoothstep(-0.6, 1.0, towardSun));

  // Vertical gradient. The power < 1 keeps a broad band of warm horizon light.
  vec3 sky = mix(horizon, ATMO_ZENITH, pow(elevation, 0.55));

  // Soft glow around the sun: a wide faint halo plus a tighter bright one.
  float sunDot = max(dot(dir, ATMO_SUN_DIR), 0.0);
  float glow = 0.45 * pow(sunDot, 6.0) + 0.35 * pow(sunDot, 48.0);
  return mix(sky, ATMO_SUN, clamp(glow, 0.0, 1.0));
}
`

// Replacement fog chunks. `mvPosition` is the vertex in camera space, which every built-in
// material (instanced or not) computes before `fog_vertex` runs.
const fogParsVertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vAtmosphereView;
#endif
`

const fogVertex = /* glsl */ `
#ifdef USE_FOG
  vAtmosphereView = mvPosition.xyz;
#endif
`

const fogParsFragment = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vAtmosphereView;
  ${ATMOSPHERE_GLSL}
#endif
`

const fogFragment = /* glsl */ `
#ifdef USE_FOG
  {
    // True distance, not depth, so haze doesn't slide around as the camera turns.
    float atmoDistance = length(vAtmosphereView);
    // Camera-space direction back to world space (a vector times a matrix = times its transpose,
    // and the transpose of the view rotation is its inverse).
    vec3 atmoDir = normalize((vec4(vAtmosphereView, 0.0) * viewMatrix).xyz);
    float atmoNear = ATMO_HAZE_WARM_MAX * (1.0 - exp(-atmoDistance * ATMO_HAZE_DENSITY));
    float atmoFar = smoothstep(ATMO_FADE_START, ATMO_FADE_END, atmoDistance);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, ATMO_HAZE_WARM, atmoNear);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, atmosphereSky(atmoDir), atmoFar);
  }
#endif
`

let installed = false

/**
 * Swaps Three's built-in fog for the sky-matched haze in every material with `fog: true` (the
 * default for built-in materials) once the scene has a `fog` set. Must run before the first
 * material compiles. Custom `ShaderMaterial`s opt in by including the fog chunks and `fog: true`.
 */
export function installAtmosphereFog(): void {
  if (installed) return
  installed = true
  ShaderChunk.fog_pars_vertex = fogParsVertex
  ShaderChunk.fog_vertex = fogVertex
  ShaderChunk.fog_pars_fragment = fogParsFragment
  ShaderChunk.fog_fragment = fogFragment
}
