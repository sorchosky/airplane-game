import { MeshToonMaterial } from 'three'
import { getToonGradientMap } from '../render/toon'
import { seaIslands } from './sea'
import { SUN_TINT_AWAY, SUN_TINT_TOWARD, TERRAIN_PALETTE, type Rgb } from './terrainColor'
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

/**
 * Noise frequency (1/m) closest to `1 / scale` that fits a whole number of value-noise cells into
 * one world period, so the colour noise repeats with the terrain (#176). Off by under 1 %.
 */
export function periodicFrequency(scale: number, period: number): number {
  return Math.max(1, Math.round(period / scale)) / period
}

/** Lattice cells per world period at `frequency` (1/m). A whole number when it repeats. */
export function cellsPerPeriod(frequency: number, period: number): number {
  return Math.round(frequency * period)
}

/**
 * The colour noise layers' frequencies (1/m). Each second layer used to be the first times a
 * stretch (2.3, 1.7); here the stretch is rounded to whole cells per period as well.
 */
export function terrainNoiseFrequencies(config: TerrainConfig) {
  const period = config.worldPeriod
  const b = config.bands
  const color = periodicFrequency(b.noiseScale, period)
  const macro = periodicFrequency(b.macroScale, period)
  return {
    color,
    colorFine: periodicFrequency(1 / (color * 2.3), period),
    macro,
    macroFine: periodicFrequency(1 / (macro * 1.7), period),
    brush: periodicFrequency(b.brushScale, period),
  }
}

/** Value-noise lattice period along y, which doesn't wrap: past any terrain height. */
const NO_WRAP = 65536

/** m, shore foam fades out between these camera distances so it never shimmers far away */
const FOAM_FADE_START = 400
const FOAM_FADE_END = 1500

/** GLSL for `terrainIsland`'s body: one wrapped distance per island, unrolled. */
function islandGlsl(config: TerrainConfig): string {
  const period = float(config.worldPeriod)
  return seaIslands(config)
    .map(
      (island) =>
        `  d = xz - vec2(${float(island.x)}, ${float(island.z)});
  d -= ${period} * floor(d / ${period} + 0.5);
  w = max(w, 1.0 - smoothstep(${float(island.maxRadius)}, ${float(island.maxRadius + config.bands.islandFade)}, length(d)));`,
    )
    .join('\n')
}

export function terrainColorGlsl(config: TerrainConfig): string {
  const b = config.bands
  const p = TERRAIN_PALETTE
  const period = config.worldPeriod
  const f = terrainNoiseFrequencies(config)
  const cells = (frequency: number) => float(cellsPerPeriod(frequency, period))
  // Frequencies print with more digits than `float`: 57 / 24000 m needs them to stay periodic.
  const freq = (frequency: number) => frequency.toPrecision(10)
  return /* glsl */ `
const vec3 TERRAIN_GRASS_LIGHT = ${vec3(p.grassLight)};
const vec3 TERRAIN_GRASS_SHADOW = ${vec3(p.grassShadow)};
const vec3 TERRAIN_SAND = ${vec3(p.sand)};
const vec3 TERRAIN_SAND_TROPICAL = ${vec3(p.sandTropical)};
const vec3 TERRAIN_ROCK = ${vec3(p.rock)};
const vec3 TERRAIN_SNOW = ${vec3(p.snow)};
const vec3 TERRAIN_WATER_SHALLOW = ${vec3(p.waterShallow)};
const vec3 TERRAIN_WATER_DEEP = ${vec3(p.waterDeep)};
const float TERRAIN_WATER_LEVEL = ${float(config.waterLevel)};
const vec3 TERRAIN_LUMA = vec3(0.2126, 0.7152, 0.0722);

// 0..1, how far a point is on one of the sea's islands (#235); mirrors \`islandWeightAt\`. Each
// island is taken at its copy nearest the point, as the world wraps.
float terrainIsland(vec2 xz) {
  float w = 0.0;
  vec2 d;
${islandGlsl(config)}
  return w;
}

// Hash and value noise. Smooth, -1..1, cheap enough to run per pixel.
float terrainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// The lattice repeats every \`period\` cells (#176): the world wraps every ${float(period)} m, and
// each layer's frequency fits a whole number of cells into that, so the colour has no seam.
float terrainValueNoise(vec2 p, vec2 period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, period);
  vec2 i1 = mod(i + 1.0, period);
  float a = terrainHash(i0);
  float b = terrainHash(vec2(i1.x, i0.y));
  float c = terrainHash(vec2(i0.x, i1.y));
  float d = terrainHash(i1);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

// Two octaves: broad patches plus a little breakup inside them.
float terrainNoise(vec2 worldXZ) {
  float a = terrainValueNoise(worldXZ * ${freq(f.color)}, vec2(${cells(f.color)}));
  float b = terrainValueNoise(worldXZ * ${freq(f.colorFine)} + 17.0, vec2(${cells(f.colorFine)}));
  return clamp(a * 0.7 + b * 0.3, -1.0, 1.0);
}

// Macro grass drift: hue from the first layer, value from the second.
vec2 terrainMacroNoise(vec2 worldXZ) {
  return vec2(
    terrainValueNoise(worldXZ * ${freq(f.macro)}, vec2(${cells(f.macro)})),
    terrainValueNoise(worldXZ * ${freq(f.macroFine)} + 41.0, vec2(${cells(f.macroFine)}))
  );
}

// World-space triplanar brush breakup. Flat ground reads the XZ projection while cliffs select
// XY/YZ, so detail stays anchored without turning into stretched vertical streaks. Smooth normal
// weights keep the projection continuous across terrain chunks and LODs.
float terrainBrushNoise(vec3 world, vec3 normal) {
  vec3 weights = abs(normal);
  weights *= weights;
  weights /= max(weights.x + weights.y + weights.z, 1e-4);
  // x and z wrap with the world; y never does.
  vec3 p = world * vec3(${freq(f.brush)}, ${freq(1 / b.brushScale)}, ${freq(f.brush)});
  float wrap = ${cells(f.brush)};
  float x = terrainValueNoise(p.yz + 71.0, vec2(${float(NO_WRAP)}, wrap));
  float y = terrainValueNoise(p.xz + 113.0, vec2(wrap));
  float z = terrainValueNoise(p.xy + 157.0, vec2(wrap, ${float(NO_WRAP)}));
  return clamp(x * weights.x + y * weights.y + z * weights.z, -1.0, 1.0);
}

// Hue rotation about the grey axis; mirrors \`rotateHue\`.
vec3 terrainRotateHue(vec3 c, float degrees) {
  float a = radians(degrees);
  float cosA = cos(a);
  float sinA = sin(a) / sqrt(3.0);
  float grey = (c.r + c.g + c.b) / 3.0 * (1.0 - cosA);
  return c * cosA + vec3(c.b - c.g, c.r - c.b, c.g - c.r) * sinA + grey;
}

vec3 terrainColor(
  float height, float slope, float noise,
  float macro, float macroValue, float brush, float detailCoverage, float distance,
  float sunFacing, vec3 ambientSky, float island
) {
  float sandLine = TERRAIN_WATER_LEVEL + mix(${float(b.sandHeight)}, ${float(b.islandSandHeight)}, island)
    + noise * mix(${float(b.sandJitter)}, ${float(b.islandSandJitter)}, island);
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

  // Sun-facing grass leans to grass-light, grass turned away to a cool grass-shadow and sky mix.
  vec3 grass = mix(TERRAIN_GRASS_LIGHT, TERRAIN_GRASS_SHADOW, grassShade);
  float toward = ${float(b.sunTintToward)} * smoothstep(${float(SUN_TINT_TOWARD[0])}, ${float(SUN_TINT_TOWARD[1])}, sunFacing);
  float away = ${float(b.sunTintAway)} * (1.0 - smoothstep(${float(SUN_TINT_AWAY[1])}, ${float(SUN_TINT_AWAY[0])}, sunFacing));
  grass = mix(grass, TERRAIN_GRASS_LIGHT, toward);
  // The sky's hue at grass-shadow's brightness; mirrors \`coolGrass\`.
  vec3 skyAtShadow = ambientSky * (dot(TERRAIN_GRASS_SHADOW, TERRAIN_LUMA) / max(dot(ambientSky, TERRAIN_LUMA), 1e-4));
  grass = mix(grass, mix(TERRAIN_GRASS_SHADOW, skyAtShadow, ${float(b.sunTintCool)}), away);
  grass = terrainRotateHue(grass, macro * ${float(b.macroHueDegrees)}) * (1.0 + macroValue * ${float(b.macroValue)});

  vec3 c = mix(grass, mix(TERRAIN_SAND, TERRAIN_SAND_TROPICAL, island), sand);
  c = mix(c, TERRAIN_ROCK, rock);
  c = mix(c, TERRAIN_SNOW, snow);
  float rockDetail = mix(brush, macro, ${float(b.rockMacroMix)});
  float detail = mix(brush, rockDetail, rock);
  c *= 1.0 + ${float(b.brushValue)} * detail * (1.0 - snow) * detailCoverage
    * (1.0 - smoothstep(${float(b.brushFadeStart)}, ${float(b.brushFadeEnd)}, distance));
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
varying vec3 vTerrainNormal;
`

const VERTEX_MAIN = /* glsl */ `
#include <begin_vertex>
vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);
`

function fragmentPars(config: TerrainConfig): string {
  return /* glsl */ `
uniform float uWaterTime;
// The lighting preset's ambient sky (linear) and, when there's no fog chunk to declare it, the
// sun direction: both from \`atmosphereUniforms.ts\`.
uniform vec3 atmoAmbientSky;
#ifndef USE_FOG
uniform vec3 atmoSunDir;
#endif
varying vec3 vTerrainWorld;
varying vec3 vTerrainNormal;
${terrainColorGlsl(config)}
`
}

function fragmentColor(config: TerrainConfig): string {
  return /* glsl */ `
#include <color_fragment>
{
  vec3 terrainNormal = normalize(vTerrainNormal);
  float terrainNoiseValue = terrainNoise(vTerrainWorld.xz);
  float terrainSlope = 1.0 - clamp(terrainNormal.y, 0.0, 1.0);
  float terrainDistance = length(vViewPosition);
  vec2 terrainMacro = terrainMacroNoise(vTerrainWorld.xz);
  // Fade when a 70 m feature approaches six pixels. fwidth follows actual DPR, including 0.75.
  float terrainDetailFootprint = length(fwidth(vTerrainWorld)) / ${float(config.bands.brushScale)};
  float terrainDetailCoverage = 1.0 - smoothstep(0.0625, 0.1667, terrainDetailFootprint);
  diffuseColor.rgb = terrainColor(
    vTerrainWorld.y,
    terrainSlope,
    terrainNoiseValue,
    terrainMacro.x,
    terrainMacro.y,
    terrainBrushNoise(vTerrainWorld, terrainNormal),
    terrainDetailCoverage,
    terrainDistance,
    dot(terrainNormal, atmoSunDir),
    atmoAmbientSky,
    terrainIsland(vTerrainWorld.xz)
  );
  float foam = terrainFoam(vTerrainWorld.y, terrainNoiseValue, uWaterTime, terrainDistance);
  diffuseColor.rgb = mix(diffuseColor.rgb, TERRAIN_SNOW, foam * 0.8);
}
`
}

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
      .replace('#include <color_fragment>', fragmentColor(config))
  }
  material.customProgramCacheKey = () => 'terrain'
  return material
}
