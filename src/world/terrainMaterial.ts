import { MeshToonMaterial } from 'three'
import { getToonGradientMap } from '../render/toon'
import { TERRAIN_PALETTE, type Rgb } from './terrainColor'
import type { TerrainConfig } from './terrainConfig'
import { waterTimeUniform } from './waterShader'

// Terrain material: the shared toon material (#21's gradient map, so the terrain gets the same
// soft three-band cel lighting as everything else) with its flat color swapped for one computed
// per pixel from height and slope. No image textures: every color comes from the tokens.
//
// Three.js builds its materials from GLSL "chunks". `onBeforeCompile` lets us splice our own code
// into those chunks before the shader compiles:
// - Vertex shader: hand the pixel shader each vertex's world position and how much its normal
//   points up (1 = flat ground, 0 = a vertical cliff).
// - Fragment (pixel) shader: right after the material's base color is set, replace it with the
//   band color. Lighting, toon banding and the haze all run after that, unchanged.
//
// `terrainColorAt` in `terrainColor.ts` is the tested TypeScript mirror of `terrainColor()` below.

function vec3(rgb: Rgb): string {
  return `vec3(${rgb.map((v) => v.toFixed(5)).join(', ')})`
}

function float(value: number): string {
  return value.toFixed(5)
}

/** m, shore foam fades out between these camera distances so it never shimmers far away */
const FOAM_FADE_START = 400
const FOAM_FADE_END = 1500

export function terrainColorGlsl(config: TerrainConfig): string {
  const b = config.bands
  const p = TERRAIN_PALETTE
  return /* glsl */ `
const vec3 TERRAIN_GRASS_LIGHT = ${vec3(p.grassLight)};
const vec3 TERRAIN_GRASS_SHADOW = ${vec3(p.grassShadow)};
const vec3 TERRAIN_SAND = ${vec3(p.sand)};
const vec3 TERRAIN_ROCK = ${vec3(p.rock)};
const vec3 TERRAIN_SNOW = ${vec3(p.snow)};
const vec3 TERRAIN_WATER_SHALLOW = ${vec3(p.waterShallow)};
const vec3 TERRAIN_WATER_DEEP = ${vec3(p.waterDeep)};
const float TERRAIN_WATER_LEVEL = ${float(config.waterLevel)};

// Hash and value noise. Smooth, -1..1, cheap enough to run per pixel.
float terrainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float terrainValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = terrainHash(i);
  float b = terrainHash(i + vec2(1.0, 0.0));
  float c = terrainHash(i + vec2(0.0, 1.0));
  float d = terrainHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

// Two octaves: broad patches plus a little breakup inside them.
float terrainNoise(vec2 worldXZ) {
  vec2 p = worldXZ / ${float(b.noiseScale)};
  return clamp(terrainValueNoise(p) * 0.7 + terrainValueNoise(p * 2.3 + 17.0) * 0.3, -1.0, 1.0);
}

vec3 terrainColor(float height, float slope, float noise) {
  float sandLine = TERRAIN_WATER_LEVEL + ${float(b.sandHeight)} + noise * ${float(b.sandJitter)};
  float snowLine = ${float(b.snowHeight)} + noise * ${float(b.snowJitter)};
  float jitteredSlope = slope + noise * ${float(b.slopeJitter)};
  float depth = TERRAIN_WATER_LEVEL - height;

  float grassShade = ${float(b.grassVariation)} * (0.5 - 0.5 * noise);
  float sand = 1.0 - smoothstep(sandLine - ${float(b.sandBlend)}, sandLine + ${float(b.sandBlend)}, height);
  float rock = smoothstep(${float(b.rockSlope - b.rockBlend)}, ${float(b.rockSlope + b.rockBlend)}, jitteredSlope);
  float snow = smoothstep(snowLine - ${float(b.snowBlend)}, snowLine + ${float(b.snowBlend)}, height)
    * (1.0 - smoothstep(${float(b.snowMaxSlope - b.rockBlend)}, ${float(b.snowMaxSlope + b.rockBlend)}, jitteredSlope));
  float water = ${float(b.underwaterTint)} * smoothstep(0.0, 1.0, depth);
  float waterDepth = smoothstep(0.0, ${float(b.deepWaterDepth)}, depth);

  vec3 c = mix(TERRAIN_GRASS_LIGHT, TERRAIN_GRASS_SHADOW, grassShade);
  c = mix(c, TERRAIN_SAND, sand);
  c = mix(c, TERRAIN_ROCK, rock);
  c = mix(c, TERRAIN_SNOW, snow);
  return mix(c, mix(TERRAIN_WATER_SHALLOW, TERRAIN_WATER_DEEP, waterDepth), water);
}

// Soft foam line hugging the shore just above the water. It breathes slowly with time, and the
// noise staggers it so the whole coastline doesn't pulse in sync.
float terrainFoam(float height, float noise, float time, float distance) {
  float above = height - TERRAIN_WATER_LEVEL;
  float reach = ${float(b.foamHeight)} * (0.75 + 0.25 * sin(time * 0.8 + noise * 6.0));
  float band = smoothstep(-0.15, 0.05, above) * (1.0 - smoothstep(reach * 0.6, reach, above));
  return band * (1.0 - smoothstep(${float(FOAM_FADE_START)}, ${float(FOAM_FADE_END)}, distance));
}
`
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vTerrainWorld;
varying float vTerrainUp;
`

const VERTEX_MAIN = /* glsl */ `
#include <begin_vertex>
vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTerrainUp = normalize(mat3(modelMatrix) * objectNormal).y;
`

function fragmentPars(config: TerrainConfig): string {
  return /* glsl */ `
uniform float uWaterTime;
varying vec3 vTerrainWorld;
varying float vTerrainUp;
${terrainColorGlsl(config)}
`
}

const FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
{
  float terrainNoiseValue = terrainNoise(vTerrainWorld.xz);
  float terrainSlope = 1.0 - clamp(vTerrainUp, 0.0, 1.0);
  diffuseColor.rgb = terrainColor(vTerrainWorld.y, terrainSlope, terrainNoiseValue);
  float foam = terrainFoam(vTerrainWorld.y, terrainNoiseValue, uWaterTime, length(vViewPosition));
  diffuseColor.rgb = mix(diffuseColor.rgb, TERRAIN_SNOW, foam * 0.8);
}
`

/**
 * The one terrain material every tile shares. A `MeshToonMaterial` on the toon factory's shared
 * gradient map, so it lights exactly like the other toon materials. Terrain has no outline
 * (see docs/decisions.md). Keeps `fog: true`, so the haze from #22 still applies on top.
 */
export function createTerrainMaterial(config: TerrainConfig): MeshToonMaterial {
  const material = new MeshToonMaterial({ color: 0xffffff, gradientMap: getToonGradientMap() })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterTimeUniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', VERTEX_MAIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragmentPars(config)}`)
      .replace('#include <color_fragment>', FRAGMENT_COLOR)
  }
  material.customProgramCacheKey = () => 'terrain'
  return material
}
