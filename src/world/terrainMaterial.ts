import { MeshToonMaterial } from 'three'
import { getToonGradientMap } from '../render/toon'
import {
  strataWarpLength,
  SUN_TINT_AWAY,
  SUN_TINT_TOWARD,
  TERRAIN_PALETTE,
  type Rgb,
} from './terrainColor'
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
const float TERRAIN_PI = 3.14159265;
const vec3 TERRAIN_LUMA = vec3(0.2126, 0.7152, 0.0722);

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

// Brush breakup (#69): three taps along the downhill direction, averaged, so on a slope the
// strokes streak down the fall line; on flat ground the taps collapse into one round sample.
// The taps are offset from the pixel rather than rotating its coordinates, so the pattern stays
// put as the normal turns.
float terrainBrushNoise(vec2 worldXZ, vec3 normal) {
  vec2 downhill = normal.xz;
  float steepness = length(downhill);
  vec2 along = steepness > 1e-4 ? downhill / steepness : vec2(0.0);
  float reach = ${float(b.brushScale)} * ${float(b.brushStretch - 1)} * 0.5 * smoothstep(0.02, 0.15, steepness);
  vec2 p = worldXZ / ${float(b.brushScale)} + 71.0;
  vec2 step = along * reach / ${float(b.brushScale)};
  float n = terrainValueNoise(p - step) + terrainValueNoise(p) + terrainValueNoise(p + step);
  // Averaging three samples narrows the spread; 1.4 brings it back to about -1..1.
  return clamp(n * (1.4 / 3.0), -1.0, 1.0);
}

// Hue rotation about the grey axis; mirrors \`rotateHue\`.
vec3 terrainRotateHue(vec3 c, float degrees) {
  float a = radians(degrees);
  float cosA = cos(a);
  float sinA = sin(a) / sqrt(3.0);
  float grey = (c.r + c.g + c.b) / 3.0 * (1.0 - cosA);
  return c * cosA + vec3(c.b - c.g, c.r - c.b, c.g - c.r) * sinA + grey;
}

// Strata cycles at height y; mirrors \`strataPhase\`.
float terrainStrataPhase(float y, float macro) {
  return y * ${float((1 / b.strataSpacingMin + 1 / b.strataSpacingMax) / 2)}
    + ${float(((1 / b.strataSpacingMin - 1 / b.strataSpacingMax) / 2) * strataWarpLength(config))} * sin(y / ${float(strataWarpLength(config))})
    + macro * ${float(b.strataJitter)};
}

vec3 terrainColor(
  float height, float slope, float noise,
  float macro, float macroValue, float brush, float distance, float sunFacing, vec3 ambientSky
) {
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

  // Sun-facing grass leans to grass-light, grass turned away to a cool grass-shadow and sky mix.
  vec3 grass = mix(TERRAIN_GRASS_LIGHT, TERRAIN_GRASS_SHADOW, grassShade);
  float toward = ${float(b.sunTintToward)} * smoothstep(${float(SUN_TINT_TOWARD[0])}, ${float(SUN_TINT_TOWARD[1])}, sunFacing);
  float away = ${float(b.sunTintAway)} * (1.0 - smoothstep(${float(SUN_TINT_AWAY[1])}, ${float(SUN_TINT_AWAY[0])}, sunFacing));
  grass = mix(grass, TERRAIN_GRASS_LIGHT, toward);
  // The sky's hue at grass-shadow's brightness; mirrors \`coolGrass\`.
  vec3 skyAtShadow = ambientSky * (dot(TERRAIN_GRASS_SHADOW, TERRAIN_LUMA) / max(dot(ambientSky, TERRAIN_LUMA), 1e-4));
  grass = mix(grass, mix(TERRAIN_GRASS_SHADOW, skyAtShadow, ${float(b.sunTintCool)}), away);
  grass = terrainRotateHue(grass, macro * ${float(b.macroHueDegrees)}) * (1.0 + macroValue * ${float(b.macroValue)});

  vec3 c = mix(grass, TERRAIN_SAND, sand);
  c = mix(c, TERRAIN_ROCK, rock);
  float strata = smoothstep(${float(b.strataRockWeight)}, ${float(b.strataRockWeight + 0.2)}, rock)
    * (1.0 - smoothstep(${float(b.strataFadeStart)}, ${float(b.strataFadeEnd)}, distance));
  // Shader-only antialiasing: strata start fading below 16 pixels a cycle and are gone by 6
  // (fwidth is cycles per pixel), so distant cliffs never turn into pinstripes or moire.
  float strataPhase = terrainStrataPhase(height, macro);
  strata *= 1.0 - smoothstep(0.0625, 0.1667, fwidth(strataPhase));
  c *= 1.0 + ${float(b.strataValue)} * sin(2.0 * TERRAIN_PI * strataPhase) * strata;
  c = mix(c, TERRAIN_SNOW, snow);
  c *= 1.0 + ${float(b.brushValue)} * brush * (1.0 - smoothstep(${float(b.brushFadeStart)}, ${float(b.brushFadeEnd)}, distance));
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
  vec2 terrainMacroP = vTerrainWorld.xz / ${float(config.bands.macroScale)};
  diffuseColor.rgb = terrainColor(
    vTerrainWorld.y,
    terrainSlope,
    terrainNoiseValue,
    terrainValueNoise(terrainMacroP),
    terrainValueNoise(terrainMacroP * 1.7 + 41.0),
    terrainBrushNoise(vTerrainWorld.xz, terrainNormal),
    terrainDistance,
    dot(terrainNormal, atmoSunDir),
    atmoAmbientSky
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
