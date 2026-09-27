import { CIRRUS_DRIFT, LIGHT_SHIFT_MAX } from '../app/screens/titleIntro'
import { color } from '../styles/tokens'

// GLSL ES 3.00 port of the Figma "Golden hour cirrus" shader fill (WGSL, WebGPU) used behind the
// title storyboard. The repo renders WebGL2 only (CLAUDE.md), so it's rewritten rather than run
// through Figma's WebGPU runtime. The math is line-for-line the same; the only change is that the
// dawn/day/dusk palette blend is baked into the `titleSky*` / `titleCloud*` tokens at the Figma
// layer's settings (time of day 75), since the title never changes time of day.
//
// Output is written straight to the canvas as sRGB, exactly like the Figma shader: no linear
// conversion, because this is a flat 2D fill, not lit geometry.
//
// #73 animates it: the Figma cloud field is the far layer, drifting slowly; a sparser, larger
// near layer drifts faster over it for parallax; and a warm light travels across with the intro's
// frosted band. With `drift`, `light` at the intro's end values it's the settled title frame.

/** Figma layer settings (0..100 sliders in the Figma UI). */
export const TITLE_SKY_PARAMS = {
  cloudCoverage: 53,
  contrast: 11,
} as const

/**
 * The near cirrus layer: how much of it shows (a sparse scatter over the far field) and how opaque
 * its wisps are at most.
 */
export const NEAR_LAYER = {
  threshold: 0.78,
  feather: 0.12,
  opacity: 0.38,
} as const

/** How far toward a cloud tone a fully covered far-layer pixel goes (Figma `mix(0.42, 0.92, …)`). */
export function cloudOpacity(): number {
  return 0.42 + (0.92 - 0.42) * (TITLE_SKY_PARAMS.contrast / 100)
}

/** Token hex → sRGB channels in 0..1. */
export function srgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255]
}

function vec3(hex: string): string {
  return `vec3(${srgb(hex)
    .map((v) => v.toFixed(5))
    .join(', ')})`
}

function float(value: number): string {
  return value.toFixed(5)
}

export const TITLE_SKY_VERTEX = /* glsl */ `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

export function titleSkyFragment(): string {
  return /* glsl */ `#version 300 es
precision highp float;

uniform vec2 resolution;
// Seconds of drift; each layer scales it by its own rate.
uniform float drift;
// x: where the travelling light is centered (0..1 across), y: its strength.
uniform vec2 light;
out vec4 fragColor;

const vec3 SKY_TOP = ${vec3(color.titleSkyTop)};
const vec3 SKY_MID = ${vec3(color.titleSkyMid)};
const vec3 SKY_LOW = ${vec3(color.titleSkyLow)};
const vec3 CLOUD_WARM = ${vec3(color.titleCloudWarm)};
const vec3 CLOUD_COOL = ${vec3(color.titleCloudCool)};
const float COVERAGE = ${float(TITLE_SKY_PARAMS.cloudCoverage / 100)};
const float DEFINITION = ${float(TITLE_SKY_PARAMS.contrast / 100)};
const float DRIFT_FAR = ${float(CIRRUS_DRIFT.far)};
const float DRIFT_NEAR = ${float(CIRRUS_DRIFT.near)};
const float NEAR_THRESHOLD = ${float(NEAR_LAYER.threshold)};
const float NEAR_FEATHER = ${float(NEAR_LAYER.feather)};
const float NEAR_OPACITY = ${float(NEAR_LAYER.opacity)};

float hash21(vec2 p) {
  vec2 q = fract(p * vec2(123.34, 456.21));
  return fract(dot(q, q + 45.32));
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 s = local * local * (3.0 - 2.0 * local);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

float cirrusFbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.56;
  for (int i = 0; i < 5; i++) {
    total += amplitude * valueNoise(p);
    p = vec2(p.x * 1.93 + p.y * 0.18, -p.x * 0.12 + p.y * 2.08) + vec2(7.1, 3.7);
    amplitude *= 0.49;
  }
  return total;
}

vec3 palette3(vec3 a, vec3 b, vec3 c, float t) {
  return mix(mix(a, b, smoothstep(0.0, 0.58, t)), c, smoothstep(0.52, 1.0, t));
}

void main() {
  // Figma's uv has y = 0 at the top; gl_FragCoord has y = 0 at the bottom.
  vec2 uv = vec2(gl_FragCoord.x / resolution.x, 1.0 - gl_FragCoord.y / resolution.y);
  float aspect = resolution.x / max(resolution.y, 1.0);

  float horizon = pow(clamp(1.0 - uv.y, 0.0, 1.0), 1.35);
  vec3 sky = palette3(SKY_TOP, SKY_MID, SKY_LOW, horizon);

  vec2 equalP = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  vec2 windP = vec2(equalP.x * 2.15 + equalP.y * 0.72, equalP.y * 10.5 - equalP.x * 0.22);
  // The far layer: the Figma field, carried slowly along the wind.
  windP.x -= drift * DRIFT_FAR;
  float broad = cirrusFbm(windP * vec2(1.15, 0.62) + vec2(1.7, 5.2));
  float filament = cirrusFbm(windP * vec2(2.85, 1.1) + vec2(13.4, 2.1));
  float ribbonWarp = sin(windP.x * 2.2 + broad * 5.4) * 0.12;
  float ribbons = cirrusFbm(vec2(windP.x * 1.4, windP.y * 0.45 + ribbonWarp));
  float cloudField = broad * 0.48 + filament * 0.27 + ribbons * 0.25;

  float threshold = mix(1.12, 0.30, COVERAGE);
  float feather = mix(0.22, 0.075, DEFINITION);
  float cloudMask = smoothstep(threshold - feather, threshold + feather, cloudField);
  cloudMask *= smoothstep(0.01, 0.16, uv.y) * (1.0 - 0.18 * smoothstep(0.82, 1.0, uv.y));
  cloudMask *= smoothstep(0.0, 0.04, COVERAGE);
  cloudMask = mix(cloudMask, 1.0, smoothstep(0.92, 1.0, COVERAGE));

  float lightFacing = smoothstep(0.15, 0.95, broad + horizon * 0.32);
  vec3 cloudColor = mix(CLOUD_COOL, CLOUD_WARM, lightFacing);
  cloudColor = mix(sky, cloudColor, mix(0.42, 0.92, DEFINITION));
  float overcastVeil = smoothstep(0.72, 1.0, COVERAGE) * (0.18 + 0.35 * broad);
  vec3 finalColor = mix(mix(sky, CLOUD_COOL, overcastVeil), cloudColor, cloudMask);

  // The near layer: bigger, sparser wisps sliding past faster, lit a touch warmer than the field.
  vec2 nearP = vec2(equalP.x * 1.1 + equalP.y * 0.4 - drift * DRIFT_NEAR, equalP.y * 5.2);
  float nearField = cirrusFbm(nearP + vec2(31.7, 8.3));
  float nearMask = smoothstep(NEAR_THRESHOLD - NEAR_FEATHER, NEAR_THRESHOLD + NEAR_FEATHER, nearField);
  nearMask *= smoothstep(0.05, 0.25, uv.y) * NEAR_OPACITY;
  vec3 nearColor = mix(CLOUD_COOL, CLOUD_WARM, smoothstep(0.3, 1.0, nearField + horizon * 0.3));
  finalColor = mix(finalColor, nearColor, nearMask);

  // The light that crosses with the intro's band: a soft vertical shaft lifting toward cloud warm.
  float shaft = exp(-pow((uv.x - light.x) * aspect * 1.6, 2.0));
  finalColor = mix(finalColor, CLOUD_WARM, light.y * shaft);
  fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
`
}

/** CSS stand-in for the shader (same three sky stops), shown if WebGL2 isn't available. */
export const TITLE_SKY_FALLBACK = `linear-gradient(180deg, ${color.titleSkyLow}, ${color.titleSkyMid} 45%, ${color.titleSkyTop})`

/**
 * Where the wordmark and Start can sit, as a share of screen height from the top, across the
 * aspect ratios the game runs at (a short phone in landscape puts Start lowest). The contrast
 * test checks every backdrop the sky can put behind them in this range.
 */
export const TITLE_TEXT_ROWS = { top: 0.3, bottom: 0.85 } as const

type Rgb = [number, number, number]

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** The shader's clear-sky gradient at height `y` (0 top .. 1 bottom), mirrored in TS. */
export function titleSkyAt(y: number): Rgb {
  const horizon = Math.pow(Math.min(1, Math.max(0, 1 - y)), 1.35)
  const top = srgb(color.titleSkyTop)
  const mid = srgb(color.titleSkyMid)
  const low = srgb(color.titleSkyLow)
  return mixRgb(mixRgb(top, mid, smoothstep(0, 0.58, horizon)), low, smoothstep(0.52, 1, horizon))
}

/**
 * Every colour the sky can show behind the title text, as hex: clear sky, the far cirrus at full
 * cover in either tone, the near layer's densest wisps over that, and the travelling light at its
 * peak on top. Sampled every 1% of height through `TITLE_TEXT_ROWS`.
 */
export function titleTextBackdrops(): string[] {
  const warm = srgb(color.titleCloudWarm)
  const cool = srgb(color.titleCloudCool)
  const out: string[] = []
  for (let y = TITLE_TEXT_ROWS.top; y <= TITLE_TEXT_ROWS.bottom + 1e-9; y += 0.01) {
    const sky = titleSkyAt(y)
    for (const far of [sky, mixRgb(sky, warm, cloudOpacity()), mixRgb(sky, cool, cloudOpacity())]) {
      for (const near of [
        far,
        mixRgb(far, warm, NEAR_LAYER.opacity),
        mixRgb(far, cool, NEAR_LAYER.opacity),
      ]) {
        out.push(toHex(near), toHex(mixRgb(near, warm, LIGHT_SHIFT_MAX)))
      }
    }
  }
  return out
}
