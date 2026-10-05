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
import { BOAT_CONFIG } from './boatPlan'
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

/**
 * 0..1, how far the windows' night glow is on at a night amount (`atmoNight`: 0.35 at the dusk
 * key, 1 at night). Fully on by the dusk key, fully off by morning. The shader repeats it.
 */
export function windowGlowAmount(night: number): number {
  const t = Math.min(1, Math.max(0, (night - 0.05) / 0.3))
  return t * t * (3 - 2 * t)
}

/**
 * Night glow for windows and lanterns (#224, reused by #235). Vertices carry a `glow` mask (the
 * kit's `PartOptions.glow`); the fragment adds the warm window colour to the emissive by that mask
 * and the day cycle's `atmoNight`. No lights and no extra draws: it rides the landmarks' one toon
 * material.
 */
function withWindowGlow(material: MeshToonMaterial): MeshToonMaterial {
  material.onBeforeCompile = (shader) => {
    // `atmoNight` is declared and bound by the haze chunk (`ATMO_FAR_CAP`), the same shared array.
    shader.uniforms.atmoNight = atmosphereUniforms.atmoNight
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float glow;\nvarying float vGlow;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vGlow;
const vec3 WINDOW_GLOW = ${vec3(linearRgb(color.windowGlow))};`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += WINDOW_GLOW * vGlow * smoothstep(0.05, 0.35, atmoNight);`,
      )
  }
  material.customProgramCacheKey = () => 'landmark-window-glow'
  return material
}

/** Toon material for every landmark's stone, bark, leaves and the town: colour rides on the vertices. */
export function createLandmarkMaterial(): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color: '#ffffff',
    vertexColors: true,
    gradientMap: getToonGradientMap(),
  })
  return withWindowGlow(withHazeCap(material))
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

/**
 * Clock for the boats (#225), seconds. `Boats` advances it, and not under reduced motion or
 * `?shot=`, so a still boat is a parked one.
 */
export const boatTimeUniform = { value: 0 }

const TAU = (Math.PI * 2).toFixed(7)

/**
 * The boats' motion (#225), all in the vertex shader. A boat's vertices are in its own frame and
 * carry its loop, phase and yaw as constant attributes (see `models/boats.ts`), so a frame costs
 * one time uniform. A sailboat runs round its ellipse at a steady rate, heading along the loop; a
 * moored boat stays at its berth. Both bob and roll, and the sails sway out from the mast.
 * Phases are taken as `fract` of a count of cycles, so a long session keeps its precision.
 */
const BOAT_GLSL = /* glsl */ `
uniform float boatTime;
attribute vec4 boatLoop;
attribute vec4 boatRun;
attribute float boatSail;

const float BOAT_BOB = ${BOAT_CONFIG.bob.toFixed(4)};
const float BOAT_ROLL = ${BOAT_CONFIG.roll.toFixed(5)};
const float BOAT_SWAY = ${BOAT_CONFIG.sailSway.toFixed(4)};

float boatCycle(float rate) {
  return fract(boatRun.x + boatTime * rate);
}

// Roll about the bow-stern axis, then yaw about Y; shared by positions and normals.
vec3 boatTurn(vec3 p, out float yaw) {
  float lap = boatRun.z + boatRun.y * boatTime;
  float angle = fract(lap) * ${TAU};
  float sailing = step(0.5, boatLoop.z);
  vec2 along = vec2(-sin(angle) * boatLoop.z, cos(angle) * boatLoop.w) * sign(boatRun.y);
  yaw = mix(boatRun.w, atan(-along.x, -along.y), sailing);
  float period = ${BOAT_CONFIG.bobPeriod[0].toFixed(2)} + fract(boatRun.x * 7.13) * ${(BOAT_CONFIG.bobPeriod[1] - BOAT_CONFIG.bobPeriod[0]).toFixed(2)};
  float roll = BOAT_ROLL * sin(${TAU} * (boatTime / (period * 1.17) + boatRun.x * 3.0));
  float cr = cos(roll);
  float sr = sin(roll);
  vec3 q = vec3(p.x * cr - p.y * sr, p.x * sr + p.y * cr, p.z);
  float cy = cos(yaw);
  float sy = sin(yaw);
  return vec3(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);
}

vec3 boatMoved(vec3 p) {
  float lap = boatRun.z + boatRun.y * boatTime;
  float angle = fract(lap) * ${TAU};
  float sailing = step(0.5, boatLoop.z);
  float period = ${BOAT_CONFIG.bobPeriod[0].toFixed(2)} + fract(boatRun.x * 7.13) * ${(BOAT_CONFIG.bobPeriod[1] - BOAT_CONFIG.bobPeriod[0]).toFixed(2)};
  float bob = BOAT_BOB * sin(${TAU} * (boatTime / period + boatRun.x));
  // The sails belly out and back on a slow swell of their own.
  p.x += boatSail * BOAT_SWAY * sin(${TAU} * (boatTime / ${BOAT_CONFIG.sailPeriod.toFixed(2)} + boatRun.x * 2.0));
  float yaw;
  vec3 turned = boatTurn(p, yaw);
  vec2 at = boatLoop.xy + sailing * vec2(cos(angle) * boatLoop.z, sin(angle) * boatLoop.w);
  return vec3(turned.x + at.x, turned.y + bob, turned.z + at.y);
}

vec3 boatNormal(vec3 n) {
  float yaw;
  return boatTurn(n, yaw);
}
`

/** Wraps a toon material's compile hook so its vertices move as boats. */
function withBoatMotion(material: MeshToonMaterial): MeshToonMaterial {
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    shader.uniforms.boatTime = boatTimeUniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${BOAT_GLSL}`)
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal = boatNormal(objectNormal);',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed = boatMoved(transformed);',
      )
  }
  material.customProgramCacheKey = () => 'landmark-boats'
  return material
}

/**
 * Toon material for the boats (#225): the landmarks' vertex colours, haze cap and window glow,
 * with their motion. Needs its own draw, since the landmark mesh's vertices stand still.
 */
export function createBoatMaterial(): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color: '#ffffff',
    vertexColors: true,
    gradientMap: getToonGradientMap(),
  })
  return withBoatMotion(withWindowGlow(withHazeCap(material)))
}

/** The boats' outline hull: the landmark outline, moved by the same shader as the boats. */
export function createBoatOutlineMaterial(): ShaderMaterial {
  const base = getOutlineMaterial(LANDMARK_OUTLINE)
  const vertexShader = base.vertexShader
    .replace('#include <common>', `#include <common>\n${BOAT_GLSL}`)
    .replace(
      'vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );',
      'vec4 mvPosition = modelViewMatrix * vec4( boatMoved( position ), 1.0 );',
    )
    .replace('normalMatrix * normal', 'normalMatrix * boatNormal( normal )')
  return new ShaderMaterial({
    uniforms: { ...base.uniforms, boatTime: boatTimeUniform },
    vertexShader,
    fragmentShader: base.fragmentShader,
    side: base.side,
    fog: true,
    defines: { ...LANDMARK_HAZE_DEFINES },
  })
}
