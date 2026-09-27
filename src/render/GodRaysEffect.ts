import { Effect, EffectAttribute } from 'postprocessing'
import { type Camera, Color, Uniform, Vector2, Vector3 } from 'three'
import { godRayFade, POST_FX } from './postFx'

const { samples, length, decay, glowRadius } = POST_FX.godRays

const fragmentShader = /* glsl */ `
uniform vec2 sunUv;
uniform float strength;
uniform float aspect;
uniform vec3 tint;

const int SAMPLES = ${samples};
const float STEP_LENGTH = ${(length / samples).toFixed(6)};
const float DECAY = ${decay.toFixed(4)};
const float GLOW_RADIUS = ${glowRadius.toFixed(4)};
// The sky dome never writes depth, so sky pixels keep the cleared depth of 1. Terrain at the far
// edge of the view (near 1 m, far 1.2x the view distance) still sits below this.
const float SKY_DEPTH = 0.999999;

// Sky visible at p, weighted by a glow around the sun: the light the rays carry. Taps past the
// screen edge reuse the edge pixel's sky mask, so a sun just out of frame still streams in.
float skyGlow(const in vec2 p) {
  float sky = step(SKY_DEPTH, readDepth(clamp(p, 0.0, 1.0)));
  float glow = max(0.0, 1.0 - length((p - sunUv) * vec2(aspect, 1.0)) / GLOW_RADIUS);
  return sky * glow * glow;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  // March from the pixel toward the sun. Interleaved gradient noise offsets each pixel's taps so
  // the few samples read as a smooth blur instead of stepped copies.
  vec2 stepUv = (sunUv - uv) * STEP_LENGTH;
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec2 p = uv + stepUv * jitter;
  float weight = 1.0;
  float total = 0.0;
  float light = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    light += weight * skyGlow(p);
    total += weight;
    weight *= DECAY;
    p += stepUv;
  }
  outputColor = vec4(inputColor.rgb + tint * (strength * light / total), inputColor.a);
}
`

export interface GodRaysEffectOptions {
  /** World-space direction the sun shines from, not necessarily normalized */
  sunDirection: readonly [number, number, number]
  /** Colour of the added light, hex (display sRGB), e.g. the preset's `sunGlow` */
  tint: string
}

/**
 * Screen-space god rays toward the sun (#72), `high` only. Each pixel blurs the sky mask toward
 * the sun's screen position, so the glow around the sun streams outward and whatever stands in
 * front of the sun (terrain, clouds, the plane) cuts dark shafts through it. Additive, in the
 * composer's linear buffer, before the grade.
 *
 * `camera` is set by `wrapEffect`, which passes the R3F camera as a prop.
 */
export class GodRaysEffect extends Effect {
  camera: Camera | null = null

  private readonly sunDirection: Vector3
  private readonly forward = new Vector3()
  private readonly sunPoint = new Vector3()

  constructor({ sunDirection, tint }: GodRaysEffectOptions) {
    // `Color` converts the sRGB hex into the linear working space the buffer is in.
    const linearTint = new Color(tint)
    super('GodRaysEffect', fragmentShader, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['sunUv', new Uniform(new Vector2(0.5, 0.5))],
        ['strength', new Uniform(0)],
        ['aspect', new Uniform(1)],
        ['tint', new Uniform(new Vector3(linearTint.r, linearTint.g, linearTint.b))],
      ]),
    })
    this.sunDirection = new Vector3(...sunDirection).normalize()
  }

  override setSize(width: number, height: number): void {
    this.uniforms.get('aspect')!.value = height > 0 ? width / height : 1
  }

  override update(): void {
    const camera = this.camera
    const strength = this.uniforms.get('strength')!
    if (!camera) {
      strength.value = 0
      return
    }
    camera.getWorldDirection(this.forward)
    // A point 100 m toward the sun: far enough past the 1 m near plane, well inside the far one.
    camera.getWorldPosition(this.sunPoint)
    this.sunPoint.addScaledVector(this.sunDirection, 100).project(camera)
    const u = this.sunPoint.x * 0.5 + 0.5
    const v = this.sunPoint.y * 0.5 + 0.5
    const fade = godRayFade(this.forward.dot(this.sunDirection), u, v)
    ;(this.uniforms.get('sunUv')!.value as Vector2).set(u, v)
    strength.value = POST_FX.godRays.strength * fade
  }
}
