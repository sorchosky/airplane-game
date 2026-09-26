import { color } from '../styles/tokens'

// GLSL ES 3.00 port of the Figma "Golden hour cirrus" shader fill (WGSL, WebGPU) used behind the
// title storyboard. The repo renders WebGL2 only (CLAUDE.md), so it's rewritten rather than run
// through Figma's WebGPU runtime. The math is line-for-line the same; the only change is that the
// dawn/day/dusk palette blend is baked into the `titleSky*` / `titleCloud*` tokens at the Figma
// layer's settings (time of day 75), since the title never changes time of day.
//
// Output is written straight to the canvas as sRGB, exactly like the Figma shader: no linear
// conversion, because this is a flat 2D fill, not lit geometry.

/** Figma layer settings (0..100 sliders in the Figma UI). */
export const TITLE_SKY_PARAMS = {
  cloudCoverage: 53,
  contrast: 11,
} as const

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
out vec4 fragColor;

const vec3 SKY_TOP = ${vec3(color.titleSkyTop)};
const vec3 SKY_MID = ${vec3(color.titleSkyMid)};
const vec3 SKY_LOW = ${vec3(color.titleSkyLow)};
const vec3 CLOUD_WARM = ${vec3(color.titleCloudWarm)};
const vec3 CLOUD_COOL = ${vec3(color.titleCloudCool)};
const float COVERAGE = ${float(TITLE_SKY_PARAMS.cloudCoverage / 100)};
const float DEFINITION = ${float(TITLE_SKY_PARAMS.contrast / 100)};

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
  fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
`
}

/** CSS stand-in for the shader (same three sky stops), shown if WebGL2 isn't available. */
export const TITLE_SKY_FALLBACK = `linear-gradient(180deg, ${color.titleSkyLow}, ${color.titleSkyMid} 45%, ${color.titleSkyTop})`
