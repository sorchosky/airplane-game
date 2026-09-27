import {
  BackSide,
  Color,
  DoubleSide,
  MeshToonMaterial,
  ShaderMaterial,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { color } from '../styles/tokens'
import {
  getToonGradientMap,
  injectRimLight,
  OUTLINE_FRAGMENT,
  outlineViewportHeight,
} from '../render/toon'
import { atmosphereUniforms } from './atmosphereUniforms'
import { GROW_SOFTNESS } from './scatter'
import type { FoliageConfig } from './terrainConfig'

// Materials for instanced foliage (#75). Every instance grows in and shrinks away in the vertex
// shader, with the same math as `growth` and `distanceFalloff` in `scatter.ts`: the share drawn
// falls with distance from the plane, and an instance is full size while its `keep` is under the
// share. Moving the plane or the governor's density only ever scales instances smoothly.

/** Uniforms every foliage material shares. Written once per frame by `Foliage` and `Grass`. */
export const foliageUniforms = {
  /** Plane position, x and z. */
  foliageFocus: { value: new Float32Array(2) },
  /** `densityReach` of the governor's foliage density, eased so a step never pops. */
  foliageReach: { value: 1 },
  /** s, drives the grass sway. Frozen for `?shot=`. */
  foliageTime: { value: 0 },
}

const glslFloat = (value: number) => value.toFixed(6)

const GROWTH_GLSL = /* glsl */ `
uniform vec2 foliageFocus;
uniform float foliageReach;
uniform float foliageFadeStart;
uniform float foliageFadeEnd;

float foliageGrowth(vec3 origin, float keep, float extraShare) {
  float d = distance(origin.xz, foliageFocus);
  float share = 1.0 - smoothstep(foliageFadeStart * foliageReach, foliageFadeEnd * foliageReach, d);
  share *= extraShare;
  return clamp((share * ${glslFloat(1 + GROW_SOFTNESS)} - keep) / ${glslFloat(GROW_SOFTNESS)}, 0.0, 1.0);
}

float foliageHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
`

function fadeUniforms(fadeStart: number, fadeEnd: number) {
  return {
    foliageFocus: foliageUniforms.foliageFocus,
    foliageReach: foliageUniforms.foliageReach,
    foliageFadeStart: { value: fadeStart },
    foliageFadeEnd: { value: fadeEnd },
  }
}

/**
 * Toon body for trees, bushes and boulders: vertex colours, the shared toon ramp and rim light,
 * a small per-instance value shift, and the grow/shrink fade. Needs a `foliageKeep` instanced
 * attribute beside `instanceMatrix`.
 */
export function createFoliageBodyMaterial(fadeStart: number, fadeEnd: number): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color: new Color(1, 1, 1),
    vertexColors: true,
    gradientMap: getToonGradientMap(),
  })
  const uniforms = fadeUniforms(fadeStart, fadeEnd)
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute float foliageKeep;\n${GROWTH_GLSL}\nvoid main() {\n  vec3 foliageOrigin = instanceMatrix[3].xyz;`,
      )
      .replace(
        '#include <color_vertex>',
        '#include <color_vertex>\n  vColor.rgb *= 0.88 + 0.24 * foliageHash(foliageOrigin.xz);',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed *= foliageGrowth(foliageOrigin, foliageKeep, 1.0);',
      )
    injectRimLight(shader)
  }
  material.customProgramCacheKey = () => 'foliage-body'
  return material
}

const HULL_VERTEX = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  attribute float foliageKeep;
  uniform float thickness;
  uniform float maxPixels;
  uniform float viewportHeight;
  uniform float outlineDistance;
  ${GROWTH_GLSL}
  void main() {
    vec3 origin = instanceMatrix[3].xyz;
    float grow = foliageGrowth(origin, foliageKeep, 1.0);
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( position * grow, 1.0 );
    vec3 viewNormal = normalize( normalMatrix * mat3( instanceMatrix ) * normal );
    float depth = max( -mvPosition.z, 1e-3 );
    float metersPerPixel = 2.0 * depth / ( projectionMatrix[1][1] * viewportHeight );
    // Thins to nothing before outlineDistance, where the hull buffer stops.
    float near = 1.0 - smoothstep( outlineDistance * 0.7, outlineDistance, distance( origin.xz, foliageFocus ) );
    mvPosition.xyz += viewNormal * min( thickness, maxPixels * metersPerPixel ) * near * grow;
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`

/**
 * Inverted-hull outline for instanced foliage: the shared outline shader's look (`toon.ts`), plus
 * `instanceMatrix`, the grow/shrink fade, and a fade-out before `outlineDistance`.
 */
export function createFoliageHullMaterial(
  fadeStart: number,
  fadeEnd: number,
  config: FoliageConfig,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...fadeUniforms(fadeStart, fadeEnd),
      color: { value: new Color(color.outline) },
      thickness: { value: FOLIAGE_OUTLINE.thickness },
      maxPixels: { value: FOLIAGE_OUTLINE.maxPixels },
      viewportHeight: outlineViewportHeight,
      outlineDistance: { value: config.outlineDistance },
      ...atmosphereUniforms,
      fogColor: { value: new Color() },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
      fogDensity: { value: 0.00025 },
    },
    vertexShader: HULL_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: BackSide,
    fog: true,
  })
}

/**
 * Foliage outline weight. Thicker in the world than the plane's 0.06 m (which would vanish on a
 * tree 100 m away) but capped lower on screen, so near trees stay lighter-lined than the plane.
 */
export const FOLIAGE_OUTLINE = { thickness: 0.35, maxPixels: 2 } as const

/** Grass-only uniforms, written every frame by `Grass`. */
export const grassUniforms = {
  /** 0..1, the altitude share: 1 low over the ground, 0 at `grassAltitudeMax`. */
  grassAltitude: { value: 1 },
  /** m, sway of a card tip, already scaled by airspeed. */
  grassSway: { value: 0 },
  /** Plane ground point x, z; push strength in m; radius in m. */
  grassDownwash: { value: new Float32Array(4) },
}

/** Direction the sway leans, world x and z. A steady breeze across the valley. */
const WIND_DIRECTION = [0.8, 0.6] as const

/**
 * Wind-animated grass cards. Toon-shaded with straight-up normals so they light like the ground,
 * no outline, alpha-tested blade mask. Needs a `grassCard` instanced attribute (`x, y, z, keep`).
 */
export function createGrassMaterial(mask: Texture, config: FoliageConfig): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color: new Color(1, 1, 1),
    gradientMap: getToonGradientMap(),
    alphaMap: mask,
    alphaTest: 0.5,
    side: DoubleSide,
  })
  const uniforms = {
    ...fadeUniforms(config.grassFadeStart, config.grassDistance),
    ...grassUniforms,
    foliageTime: foliageUniforms.foliageTime,
    grassRoot: { value: new Color(color.grassShadow).lerp(new Color(color.grassLight), 0.45) },
    grassTip: { value: new Color(color.grassLight) },
  }
  const twoPiHz = glslFloat(Math.PI * 2 * config.grassSwayHz)
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute vec4 grassCard;
uniform float grassAltitude;
uniform float grassSway;
uniform vec4 grassDownwash;
uniform float foliageTime;
varying float vGrassTip;
varying float vGrassShade;
${GROWTH_GLSL}
void main() {`,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );')
      .replace(
        '#include <begin_vertex>',
        `vec3 origin = grassCard.xyz;
  float seed = foliageHash( origin.xz );
  float seed2 = fract( seed * 91.7 );
  float grow = foliageGrowth( origin, grassCard.w, grassAltitude );
  vec3 card = position * vec3( 2.0 + 1.0 * seed2, 1.0 + 0.8 * seed, 2.0 + 1.0 * seed2 ) * grow;
  float angle = seed * 6.2831853;
  vec3 transformed = vec3( cos( angle ) * card.x - sin( angle ) * card.z, card.y, sin( angle ) * card.x + cos( angle ) * card.z );
  float tip = position.y * position.y;
  // Sway: one breeze, a phase per card and a slow travelling wave across the field.
  float phase = seed * 6.2831853 + dot( origin.xz, vec2( 0.045, 0.03 ) );
  transformed.xz += vec2( ${glslFloat(WIND_DIRECTION[0])}, ${glslFloat(WIND_DIRECTION[1])} ) * sin( foliageTime * ${twoPiHz} + phase ) * grassSway * tip;
  // Downwash: flattened outward from the point under the plane.
  vec2 away = origin.xz - grassDownwash.xy;
  float awayLength = max( length( away ), 1e-3 );
  float push = grassDownwash.z * ( 1.0 - smoothstep( 0.0, grassDownwash.w, awayLength ) );
  transformed.xz += away / awayLength * push * tip;
  transformed.y *= 1.0 - 0.4 * min( push, 1.0 );
  transformed += origin;
  vGrassTip = position.y;
  vGrassShade = seed2;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 grassRoot;\nuniform vec3 grassTip;\nvarying float vGrassTip;\nvarying float vGrassShade;\nvoid main() {',
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb *= mix( grassRoot, grassTip, vGrassTip ) * ( 0.92 + 0.16 * vGrassShade );',
      )
  }
  material.customProgramCacheKey = () => 'foliage-grass'
  return material
}
