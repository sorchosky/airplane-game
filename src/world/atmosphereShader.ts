import { ShaderChunk, ShaderLib } from 'three'
import { atmosphereUniforms } from './atmosphereUniforms'
import { TERRAIN_CONFIG } from './terrainConfig'

// GLSL for the sky and the distance haze. Both call the same `atmosphereSky` function, which is
// what guarantees there is no seam: a fully hazed hill is the exact colour of the sky behind it.
//
// Three.js applies fog as the very last step of every built-in material, after tone mapping and
// the sRGB conversion, so the colours below are plain sRGB (straight from the token hex) and the
// haze mixes in that display space. That keeps the sky and the haze on the same footing.
//
// With post-processing on (#26), the scene renders into a linear buffer instead of the canvas.
// `atmosphereToDisplay`/`atmosphereFromDisplay` convert around the haze mix and the sky output
// for that case, and are no-ops when drawing straight to the canvas.

function glslFloat(value: number): string {
  return value.toFixed(6)
}

const config = TERRAIN_CONFIG

/**
 * The lighting preset's uniforms (`atmosphereUniforms.ts`), the haze constants, and
 * `atmosphereSky(dir)`: the sky colour (minus the sun disc) along a world direction.
 */
export const ATMOSPHERE_GLSL = /* glsl */ `
uniform vec3 atmoZenith;
uniform vec3 atmoHorizon;
uniform vec3 atmoHaze;
uniform vec3 atmoSunGlow;
uniform vec3 atmoSunDisc;
uniform vec3 atmoSunDir;
const float ATMO_COOL_SHIFT = ${glslFloat(config.hazeCoolShift)};
const float ATMO_HAZE_DENSITY = ${glslFloat(config.hazeDensity)};
const float ATMO_HAZE_WARM_MAX = ${glslFloat(config.hazeWarmMax)};

// linearToOutputTexel() is defined by three.js per render target: sRGB encoding for the canvas,
// identity for the post-processing buffer. The comparison folds to a constant when compiled.
bool atmosphereOutputIsLinear() {
  return linearToOutputTexel(vec4(0.5)).r < 0.6;
}

/** A fragment colour as written for the current target, to display sRGB. */
vec3 atmosphereToDisplay(vec3 value) {
  return atmosphereOutputIsLinear() ? sRGBTransferOETF(vec4(value, 1.0)).rgb : value;
}

/** Display sRGB to the colour space the current target expects. */
vec3 atmosphereFromDisplay(vec3 value) {
  return atmosphereOutputIsLinear() ? sRGBTransferEOTF(vec4(value, 1.0)).rgb : value;
}

vec3 atmosphereSky(vec3 dir) {
  // Below the horizon the sky is the horizon colour, so terrain fading at the edge meets it.
  float elevation = clamp(dir.y, 0.0, 1.0);

  // Horizon tint: warm facing the sun, cooler (toward the zenith colour) facing away from it.
  vec2 level = dir.xz;
  float levelLength = length(level);
  float towardSun = levelLength > 1e-4 ? dot(level / levelLength, normalize(atmoSunDir.xz)) : 0.0;
  vec3 coolHorizon = mix(atmoHorizon, atmoZenith, ATMO_COOL_SHIFT);
  vec3 horizon = mix(coolHorizon, atmoHorizon, smoothstep(-0.6, 1.0, towardSun));

  // Vertical gradient. The power < 1 keeps a broad band of pale horizon light.
  vec3 sky = mix(horizon, atmoZenith, pow(elevation, 0.55));

  // Soft glow around the sun, in its own colour (#64): a wide faint halo plus a tighter one.
  float sunDot = max(dot(dir, atmoSunDir), 0.0);
  float glow = 0.45 * pow(sunDot, 6.0) + 0.35 * pow(sunDot, 48.0);
  return mix(sky, atmoSunGlow, clamp(glow, 0.0, 1.0));
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

// The far fade runs from the scene fog's `near` to its `far`: three.js uploads both to every
// fog material, so the governor can move the fade with the view distance without recompiling.
const fogParsFragment = /* glsl */ `
#ifdef USE_FOG
  uniform float fogNear;
  uniform float fogFar;
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
    float atmoFar = smoothstep(fogNear, fogFar, atmoDistance);
    #ifdef ATMO_FAR_CAP
      // Landmarks (#76) cap the far layer so their silhouettes stay cutouts, then let go past the
      // terrain's own full fade so they're gone before the far plane clips them.
      atmoFar = mix(
        min(atmoFar, ATMO_FAR_CAP),
        1.0,
        smoothstep(fogFar, fogFar * ATMO_FAR_RELEASE, atmoDistance)
      );
    #endif
    vec3 atmoColor = atmosphereToDisplay(gl_FragColor.rgb);
    atmoColor = mix(atmoColor, atmoHaze, atmoNear);
    atmoColor = mix(atmoColor, atmosphereSky(atmoDir), atmoFar);
    gl_FragColor.rgb = atmosphereFromDisplay(atmoColor);
  }
#endif
`

let installed = false

/**
 * Swaps Three's built-in fog for the sky-matched haze in every material with `fog: true` (the
 * default for built-in materials) once the scene has a `fog` set. Must run before the first
 * material compiles. Custom `ShaderMaterial`s opt in by including the fog chunks, `fog: true`, and
 * `...atmosphereUniforms` in their uniforms.
 *
 * The preset's uniforms go into every built-in shader that takes fog, so each built-in material
 * gets them when it compiles (sharing the arrays, see `atmosphereUniforms.ts`).
 */
export function installAtmosphereFog(): void {
  if (installed) return
  installed = true
  for (const shader of Object.values(ShaderLib)) {
    if ('fogColor' in shader.uniforms) Object.assign(shader.uniforms, atmosphereUniforms)
  }
  ShaderChunk.fog_pars_vertex = fogParsVertex
  ShaderChunk.fog_vertex = fogVertex
  ShaderChunk.fog_pars_fragment = fogParsFragment
  ShaderChunk.fog_fragment = fogFragment
}
