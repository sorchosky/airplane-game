import { Effect } from 'postprocessing'
import { Color, SRGBColorSpace, Uniform, Vector3 } from 'three'

const fragmentShader = /* glsl */ `
uniform vec3 tint;
uniform float lift;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Raise the darks toward the tint and leave the brights alone, like a warm print lift.
  outputColor = vec4(inputColor.rgb + lift * tint * (1.0 - inputColor.rgb), inputColor.a);
}
`

/**
 * Warm shadow lift for the colour grade: darks drift toward `tint`, highlights are untouched.
 * Works in display sRGB so `lift` reads the way it would in an image editor.
 */
export class WarmLiftEffect extends Effect {
  constructor({ tint, lift }: { tint: string; lift: number }) {
    // sRGB components straight from the hex, since the effect runs in display space.
    const { r, g, b } = new Color(tint).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace)
    super('WarmLiftEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['tint', new Uniform(new Vector3(r, g, b))],
        ['lift', new Uniform(lift)],
      ]),
    })
    this.inputColorSpace = SRGBColorSpace
  }
}
