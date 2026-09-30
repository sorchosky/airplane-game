import {
  BackSide,
  Color,
  MeshToonMaterial,
  ShaderMaterial,
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
 * Toon body for trees, bushes and boulders: vertex colours and the shared toon ramp,
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
  }
  material.customProgramCacheKey = () => 'foliage-body-no-rim'
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
      color: { value: new Color(color.foliageOutline) },
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
export const FOLIAGE_OUTLINE = { thickness: 0.18, maxPixels: 1.25 } as const
