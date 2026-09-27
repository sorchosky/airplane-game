import {
  Color,
  DoubleSide,
  type Material,
  MeshBasicMaterial,
  MeshToonMaterial,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from 'three'
import { getOutlineMaterial, getToonGradientMap } from '../render/toon'
import { color } from '../styles/tokens'
import { atmosphereUniforms } from './atmosphereUniforms'
import { LANDMARK_CONFIG } from './landmarks'
import { linearRgb, type Rgb } from './terrainColor'

// Materials for the landmarks (#76). All of them take the haze cap (`ATMO_FAR_CAP`, see the fog
// chunk in `atmosphereShader.ts`), so a landmark 5 km out stays a readable cutout against the sky
// instead of dissolving into it like the terrain does.

/** Material defines that switch on the landmark haze cap. */
export const LANDMARK_HAZE_DEFINES = {
  ATMO_FAR_CAP: LANDMARK_CONFIG.hazeCap.toFixed(4),
  ATMO_FAR_RELEASE: LANDMARK_CONFIG.hazeRelease.toFixed(4),
}

/**
 * Landmark outline weight. Thicker than the plane's 6 cm: these are seen from kilometres away,
 * where the line is what keeps the silhouette crisp. The pixel cap keeps it from going heavy up
 * close.
 */
export const LANDMARK_OUTLINE = { thickness: 2.5, maxPixels: 2.5 } as const

/**
 * Switches the haze cap on for a built-in material. Three compiles `material.defines` into every
 * program (and its cache key), but only `ShaderMaterial`'s types declare the field.
 */
function withHazeCap<T extends Material>(material: T): T {
  return Object.assign(material, { defines: { ...LANDMARK_HAZE_DEFINES } })
}

/** Shared clock for the waterfall ribbon and mist. `Landmarks` advances it. */
export const landmarkTimeUniform = { value: 0 }

/** Toon material for every landmark's stone, bark and leaves: the colour rides on the vertices. */
export function createLandmarkMaterial(): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color: '#ffffff',
    vertexColors: true,
    gradientMap: getToonGradientMap(),
  })
  return withHazeCap(material)
}

/**
 * The inverted-hull outline with the haze cap. It shares the shared outline material's uniforms
 * (viewport height, lighting, fog), so it follows the canvas size and the time of day with it.
 */
export function createLandmarkOutlineMaterial(): ShaderMaterial {
  const base = getOutlineMaterial(LANDMARK_OUTLINE)
  return new ShaderMaterial({
    uniforms: base.uniforms,
    vertexShader: base.vertexShader,
    fragmentShader: base.fragmentShader,
    side: base.side,
    fog: true,
    defines: { ...LANDMARK_HAZE_DEFINES },
  })
}

function vec3(rgb: Rgb): string {
  return `vec3(${rgb.map((v) => v.toFixed(5)).join(', ')})`
}

const ribbonVertex = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
varying vec2 vRibbon;
void main() {
  vRibbon = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`

// Cel-style falling water: two bands (foam white and a pale water tint) picked by streak noise
// that scrolls down the sheet, soft edges across it, and the sun's colour on top.
const ribbonFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform vec3 atmoSunLight;
varying vec2 vRibbon;

const vec3 FOAM = ${vec3(linearRgb(color.snow))};
const vec3 WATER = ${vec3(linearRgb(color.waterShallow))};

float ribbonHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float ribbonNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(ribbonHash(i), ribbonHash(i + vec2(1.0, 0.0)), u.x),
    mix(ribbonHash(i + vec2(0.0, 1.0)), ribbonHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  #include <logdepthbuf_fragment>
  float across = vRibbon.x;
  float fallen = vRibbon.y;
  // Streaks stretched down the fall, scrolling faster lower down as the water speeds up.
  float speed = 9.0 + fallen * 0.12;
  float streak = 0.6 * ribbonNoise(vec2(across * 7.0, fallen / 16.0 - uTime * speed / 16.0))
    + 0.4 * ribbonNoise(vec2(across * 17.0 + 5.0, fallen / 7.0 - uTime * speed / 7.0));
  vec3 water = streak > 0.45 ? FOAM : mix(WATER, FOAM, 0.55);
  water *= atmoSunLight / max(max(atmoSunLight.r, atmoSunLight.g), max(atmoSunLight.b, 1e-3)) * 0.92;
  float edge = smoothstep(0.0, 0.2, across) * smoothstep(1.0, 0.8, across);
  float lip = smoothstep(0.0, 4.0, fallen);
  gl_FragColor = vec4(water, edge * lip * mix(0.75, 0.95, streak));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

export function createRibbonMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      ...atmosphereUniforms,
      uTime: landmarkTimeUniform,
    },
    vertexShader: ribbonVertex,
    fragmentShader: ribbonFragment,
    defines: { ...LANDMARK_HAZE_DEFINES },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  })
}

/** Soft white spray at the foot of the fall. Unlit, so it reads as bright mist in any light. */
export function createMistMaterial(): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color: new Color(color.snow).multiplyScalar(0.9),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })
  return withHazeCap(material)
}
