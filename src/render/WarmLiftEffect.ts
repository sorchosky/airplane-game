import { Effect } from 'postprocessing'
import { SRGBColorSpace, Uniform, Vector3 } from 'three'
import type { GradeParams } from './postFx'
import { LUMA } from './postFx'

const fragmentShader = /* glsl */ `
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float shadowAmount;
uniform float highlightAmount;
uniform float saturation;

const vec3 LUMA = vec3(${LUMA.map((w) => w.toFixed(4)).join(', ')});

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Mirrors gradeColor() in postFx.ts. Only zero-luma offsets are added, so brightness holds.
  vec3 color = inputColor.rgb;
  float l = dot(color, LUMA);
  float shadowWeight = shadowAmount * (1.0 - l) * (1.0 - l);
  float highlightWeight = highlightAmount * l * l;
  color += shadowWeight * (shadowTint - dot(shadowTint, LUMA));
  color += highlightWeight * (highlightTint - dot(highlightTint, LUMA));
  color = clamp(vec3(l) + (color - vec3(l)) * (1.0 + saturation), 0.0, 1.0);
  outputColor = vec4(color, inputColor.a);
}
`

/**
 * The painterly grade on `high` (#72), now a two-tone lift: darks lean toward a teal and brights
 * toward a warm tint, with a slight saturation boost, all without changing a pixel's luma so the
 * tiers match in brightness. Works in display sRGB so the amounts read the way they would in an
 * image editor. Tints and amounts come from the lighting preset (`gradeParams`).
 */
export class WarmLiftEffect extends Effect {
  constructor({
    shadowTint,
    highlightTint,
    shadowAmount,
    highlightAmount,
    saturation,
  }: GradeParams) {
    super('WarmLiftEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['shadowTint', new Uniform(new Vector3(...shadowTint))],
        ['highlightTint', new Uniform(new Vector3(...highlightTint))],
        ['shadowAmount', new Uniform(shadowAmount)],
        ['highlightAmount', new Uniform(highlightAmount)],
        ['saturation', new Uniform(saturation)],
      ]),
    })
    this.inputColorSpace = SRGBColorSpace
  }
}
