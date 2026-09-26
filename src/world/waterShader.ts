import { ShaderMaterial, UniformsLib, UniformsUtils } from 'three'
import { color } from '../styles/tokens'
import { atmosphereUniforms } from './atmosphereUniforms'
import { linearRgb, type Rgb } from './terrainColor'

// Stylized water: one flat, slightly see-through surface with soft, slow color movement.
//
// How the animation works: a "ripple" value is built from two layers of smooth noise sampled at
// the pixel's world position, each sliding in a different direction as `uWaterTime` grows. Where
// the layers line up the surface tilts a little, which lightens the color and, facing the sun,
// catches a soft band of light. It's all computed per pixel from time, so the geometry never
// moves and there are no real waves (out of scope).
//
// Depth: the water is partly transparent, and the terrain shader already tints the lake bed from
// `water-shallow` to `water-deep` by how far below `waterLevel` it is. Seen through the surface,
// that reads as shallow/deep blending without the cost of a depth texture. The surface is more
// opaque at grazing angles, the way real water stops being see-through toward the horizon.

/** Shared clock for the water surface and the terrain's shore foam. `Water` advances it. */
export const waterTimeUniform = { value: 0 }

function vec3(rgb: Rgb): string {
  return `vec3(${rgb.map((v) => v.toFixed(5)).join(', ')})`
}

/** m, ripples and glints fade out between these distances so they never shimmer far away */
const RIPPLE_FADE_START = 500
const RIPPLE_FADE_END = 2500

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
varying vec3 vWaterWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWaterWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform float uWaterTime;
// The glint takes the lighting preset's sun colour and direction (#64). The direction is declared
// by the haze chunk when fog is on.
uniform vec3 atmoSunLight;
#ifndef USE_FOG
uniform vec3 atmoSunDir;
#endif
varying vec3 vWaterWorld;

const vec3 WATER_SHALLOW = ${vec3(linearRgb(color.waterShallow))};
const vec3 WATER_DEEP = ${vec3(linearRgb(color.waterDeep))};

float waterHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float waterNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), u.x),
    mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  ) * 2.0 - 1.0;
}

// Two drifting layers, -1..1.
float waterRipple(vec2 xz, float t) {
  return 0.6 * waterNoise(xz / 34.0 + t * vec2(0.05, 0.03))
    + 0.4 * waterNoise(xz / 13.0 + t * vec2(-0.04, 0.07));
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 toCamera = cameraPosition - vWaterWorld;
  float distance = length(toCamera);
  vec3 viewDir = toCamera / distance;
  float detail = 1.0 - smoothstep(${RIPPLE_FADE_START.toFixed(1)}, ${RIPPLE_FADE_END.toFixed(1)}, distance);

  // A small tilt from the ripple's slope (finite difference), faded with distance.
  float r = waterRipple(vWaterWorld.xz, uWaterTime);
  float rx = waterRipple(vWaterWorld.xz + vec2(2.0, 0.0), uWaterTime);
  float rz = waterRipple(vWaterWorld.xz + vec2(0.0, 2.0), uWaterTime);
  vec3 normal = normalize(vec3((r - rx) * 0.35 * detail, 1.0, (r - rz) * 0.35 * detail));

  // Looking straight down shows the shallow color; grazing angles darken toward deep.
  float facing = clamp(dot(normal, viewDir), 0.0, 1.0);
  vec3 water = mix(WATER_DEEP, WATER_SHALLOW, 0.35 + 0.45 * facing + 0.12 * r * detail);

  // Cel-style sun glint: a soft-edged band, not a sharp highlight.
  float glint = smoothstep(0.93, 0.97, dot(reflect(-viewDir, normal), atmoSunDir));
  water = mix(water, atmoSunLight, glint * 0.45 * detail);

  float alpha = mix(0.92, 0.6, facing);
  gl_FragColor = vec4(water, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

export function createWaterMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    // The fog uniforms are cloned per material; the clock and the lighting preset are shared, so
    // they're attached as is.
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      ...atmosphereUniforms,
      uWaterTime: waterTimeUniform,
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    fog: true,
  })
}
