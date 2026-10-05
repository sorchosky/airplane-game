import {
  BackSide,
  Color,
  MeshToonMaterial,
  ShaderMaterial,
  Vector2,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { color } from '../styles/tokens'
import { getToonGradientMap, OUTLINE_FRAGMENT, outlineViewportHeight } from '../render/toon'
import { atmosphereUniforms } from './atmosphereUniforms'
import { GROW_SOFTNESS } from './scatter'
import type { FoliageConfig } from './terrainConfig'

// Materials for instanced foliage (#75). Every instance grows in and shrinks away in the vertex
// shader, with the same math as `growth` and `distanceFalloff` in `scatter.ts`: the share drawn
// falls with distance from the plane, and an instance is full size while its `keep` is under the
// share. Moving the plane or the governor's density only ever scales instances smoothly.

/** Uniforms shared by the foliage body and outline materials. Written by `Foliage`. */
export const foliageUniforms = {
  /** Plane position, x and z. */
  foliageFocus: { value: new Float32Array(2) },
  /** `densityReach` of the governor's foliage density, eased so a step never pops. */
  foliageReach: { value: 1 },
  /** s, the palms' sway clock (#235). `Foliage` advances it, and not under reduced motion or `?shot=`. */
  foliageTime: { value: 0 },
}

const glslFloat = (value: number) => value.toFixed(6)

const GROWTH_GLSL = /* glsl */ `
uniform vec2 foliageFocus;
uniform float foliageReach;
uniform float foliageFadeStart;
uniform float foliageFadeEnd;
uniform vec2 foliageBlobIn;

// Canopy blobs (#232) grow in as the trees thin out: the extra share is 0 inside foliageBlobIn.x
// and 1 from foliageBlobIn.y on, the same ramp as canopyShare in scatter.ts.
float foliageBlobRise(vec3 origin) {
  float d = distance(origin.xz, foliageFocus);
  return smoothstep(foliageBlobIn.x * foliageReach, foliageBlobIn.y * foliageReach, d);
}

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

// Palm sway (#235), in the vertex shader so there is no per-frame work in JS. A `foliageSway`
// attribute (0 at the foot, 1 at the frond tips) scales a slow two-axis sway, with a quicker
// flutter at the tips and a phase from the instance's place. Body and hull share it, so the
// outline moves with the leaves.
const SWAY_GLSL = /* glsl */ `
attribute float foliageSway;
uniform float foliageTime;

vec3 foliageSwayed(vec3 p, vec3 origin) {
  float phase = foliageHash(origin.xz) * 6.2831;
  float t = foliageTime;
  float slow = sin(t * 1.1 + phase);
  float slowZ = cos(t * 0.8 + phase * 1.7);
  float flutter = sin(t * 2.6 + phase * 3.0 + p.y * 0.7);
  float w = foliageSway;
  p.x += (slow * 0.45 + flutter * 0.1) * w;
  p.z += (slowZ * 0.45 + flutter * 0.08) * w;
  return p;
}
`

/** Canopy-blob settings (#232): the ramp the blobs grow in over, and their hull. */
export interface CanopyMaterialOptions {
  /** m, from the plane, where blobs start to grow in and where they are full */
  fadeIn: number
  full: number
  /** m, past this the blob hull has thinned to nothing */
  outlineDistance: number
}

/** World thickness is only a cap: a blob is hundreds of metres off, so pixels set the line. */
const CANOPY_OUTLINE = { thickness: 60, maxPixels: 1.5 } as const

function fadeUniforms(fadeStart: number, fadeEnd: number, canopy?: CanopyMaterialOptions) {
  return {
    foliageBlobIn: { value: new Vector2(canopy?.fadeIn ?? 0, canopy?.full ?? 0) },
    foliageFocus: foliageUniforms.foliageFocus,
    foliageReach: foliageUniforms.foliageReach,
    foliageTime: foliageUniforms.foliageTime,
    foliageFadeStart: { value: fadeStart },
    foliageFadeEnd: { value: fadeEnd },
  }
}

/**
 * Toon body for trees, bushes and boulders: vertex colours and the shared toon ramp,
 * a small per-instance value shift, and the grow/shrink fade. Needs a `foliageKeep` instanced
 * attribute beside `instanceMatrix`.
 */
export function createFoliageBodyMaterial(
  fadeStart: number,
  fadeEnd: number,
  sway = false,
  canopy?: CanopyMaterialOptions,
): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color: new Color(1, 1, 1),
    vertexColors: true,
    gradientMap: getToonGradientMap(),
  })
  const uniforms = fadeUniforms(fadeStart, fadeEnd, canopy)
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute float foliageKeep;\n${GROWTH_GLSL}\n${sway ? SWAY_GLSL : ''}\nvoid main() {\n  vec3 foliageOrigin = instanceMatrix[3].xyz;`,
      )
      .replace(
        '#include <color_vertex>',
        '#include <color_vertex>\n  vColor.rgb *= 0.88 + 0.24 * foliageHash(foliageOrigin.xz);',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${
          sway ? '  transformed = foliageSwayed(transformed, foliageOrigin);\n' : ''
        }  transformed *= foliageGrowth(foliageOrigin, foliageKeep, ${
          canopy ? 'foliageBlobRise(foliageOrigin)' : '1.0'
        });`,
      )
  }
  material.customProgramCacheKey = () =>
    canopy ? 'foliage-body-canopy' : sway ? 'foliage-body-sway' : 'foliage-body-no-rim'
  return material
}

function hullVertex(sway: boolean, canopy: boolean): string {
  return /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  attribute float foliageKeep;
  uniform float thickness;
  uniform float maxPixels;
  uniform float viewportHeight;
  uniform float outlineDistance;
  ${GROWTH_GLSL}
  ${sway ? SWAY_GLSL : ''}
  void main() {
    vec3 origin = instanceMatrix[3].xyz;
    float grow = foliageGrowth(origin, foliageKeep, ${canopy ? 'foliageBlobRise(origin)' : '1.0'});
    vec3 local = ${sway ? 'foliageSwayed( position, origin )' : 'position'};
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( local * grow, 1.0 );
    // Transform the normal with the inverse transpose of the complete instance transform.
    // Using mat3(instanceMatrix) directly only works for uniform scales and can detach the
    // hull from a nonuniformly scaled body.
    mat3 instanceNormalMatrix = transpose( inverse( mat3( instanceMatrix ) ) );
    vec3 viewNormal = normalize( normalMatrix * instanceNormalMatrix * normal );
    float depth = max( -mvPosition.z, 1e-3 );
    float metersPerPixel = 2.0 * depth / ( projectionMatrix[1][1] * viewportHeight );
    // Thins to nothing before outlineDistance, where the hull buffer stops.
    float near = 1.0 - smoothstep( outlineDistance * 0.7, outlineDistance, distance( origin.xz, foliageFocus ) );
    mvPosition.xyz += viewNormal * min( thickness, maxPixels * metersPerPixel ) * near * grow;
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`
}

/**
 * Inverted-hull outline for instanced foliage: the shared outline shader's look (`toon.ts`), plus
 * `instanceMatrix`, the grow/shrink fade, and a fade-out before `outlineDistance`.
 */
export function createFoliageHullMaterial(
  fadeStart: number,
  fadeEnd: number,
  config: FoliageConfig,
  sway = false,
  canopy?: CanopyMaterialOptions,
): ShaderMaterial {
  const outline = canopy ? CANOPY_OUTLINE : FOLIAGE_OUTLINE
  return new ShaderMaterial({
    uniforms: {
      ...fadeUniforms(fadeStart, fadeEnd, canopy),
      color: { value: new Color(color.foliageOutline) },
      thickness: { value: outline.thickness },
      maxPixels: { value: outline.maxPixels },
      viewportHeight: outlineViewportHeight,
      outlineDistance: { value: canopy?.outlineDistance ?? config.outlineDistance },
      ...atmosphereUniforms,
      fogColor: { value: new Color() },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
      fogDensity: { value: 0.00025 },
    },
    vertexShader: hullVertex(sway, Boolean(canopy)),
    fragmentShader: OUTLINE_FRAGMENT,
    side: BackSide,
    fog: true,
  })
}

/**
 * Foliage outline weight. Thicker in the world than the plane's 0.06 m (which would vanish on a
 * tree 100 m away) but capped lower on screen, so near trees stay lighter-lined than the plane.
 */
export const FOLIAGE_OUTLINE = { thickness: 0.18, maxPixels: 1.25 } as const
