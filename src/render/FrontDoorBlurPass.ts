import { Pass } from 'postprocessing'
import {
  HalfFloatType,
  LinearFilter,
  ShaderMaterial,
  Uniform,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type TextureDataType,
  type WebGLRenderer,
} from 'three'
import { frontDoorBlurActive, frontDoorScrim, LUMA, POST_FX } from './postFx'

const vertexShader = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`

/** Averages the scene's 2x2 texels around each downsampled pixel, with bilinear help. */
const downsampleShader = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 texel;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 c = texture(tInput, vUv + texel * vec2(-1.0, -1.0));
  c += texture(tInput, vUv + texel * vec2(1.0, -1.0));
  c += texture(tInput, vUv + texel * vec2(-1.0, 1.0));
  c += texture(tInput, vUv + texel * vec2(1.0, 1.0));
  outColor = c * 0.25;
}
`

/** One Kawase step: four diagonal taps `offset` texels out. */
const kawaseShader = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 texel;
uniform float offset;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 o = texel * (offset + 0.5);
  vec4 c = texture(tInput, vUv + vec2(-o.x, -o.y));
  c += texture(tInput, vUv + vec2(o.x, -o.y));
  c += texture(tInput, vUv + vec2(-o.x, o.y));
  c += texture(tInput, vUv + vec2(o.x, o.y));
  outColor = c * 0.25;
}
`

const compositeShader = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBlur;
uniform float strength;
uniform float desaturation;
uniform vec3 scrimTint;
uniform float scrimAlpha;
in vec2 vUv;
out vec4 outColor;
const vec3 LUMA = vec3(${LUMA.map((w) => w.toFixed(4)).join(', ')});
void main() {
  // Mirrors frontDoorComposite() in postFx.ts.
  vec4 scene = texture(tScene, vUv);
  vec3 c = mix(scene.rgb, texture(tBlur, vUv).rgb, strength);
  float l = dot(c, LUMA);
  c = mix(c, vec3(l), desaturation * strength);
  c = mix(c, scrimTint, scrimAlpha * strength);
  outColor = vec4(c, scene.a);
}
`

function material(fragmentShader: string, uniforms: Record<string, Uniform>): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: '300 es',
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
}

/**
 * The front door's world blur (#159): a downsampled blur in the composer, so it costs a quarter of
 * a full-resolution pass and no CSS `backdrop-filter` ever sits over the live canvas. The scene is
 * averaged down to `resolutionScale`, blurred by a few Kawase steps, and mixed back by one
 * `strength` uniform with 20 % desaturation and the cool scrim tint (art bible §8).
 *
 * Set `strength` each frame. At 0 the pass disables itself, so the composer skips it and nothing
 * is drawn. Place it before the effect passes: the composer sends the last pass to the screen, and
 * a disabled last pass would leave nothing on it.
 */
export class FrontDoorBlurPass extends Pass {
  private readonly targetA: WebGLRenderTarget
  private readonly targetB: WebGLRenderTarget
  private readonly downsample = material(downsampleShader, {
    tInput: new Uniform(null),
    texel: new Uniform(new Vector2()),
  })
  private readonly kawase = material(kawaseShader, {
    tInput: new Uniform(null),
    texel: new Uniform(new Vector2()),
    offset: new Uniform(0),
  })
  private readonly composite: ShaderMaterial
  private strengthValue = 0

  constructor() {
    super('FrontDoorBlurPass')
    const options = { depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter }
    this.targetA = new WebGLRenderTarget(1, 1, { ...options, type: HalfFloatType })
    this.targetB = this.targetA.clone()
    const { tint, alpha } = frontDoorScrim()
    this.composite = material(compositeShader, {
      tScene: new Uniform(null),
      tBlur: new Uniform(null),
      strength: new Uniform(0),
      desaturation: new Uniform(POST_FX.frontDoorBlur.desaturation),
      scrimTint: new Uniform(new Vector3(...tint)),
      scrimAlpha: new Uniform(alpha),
    })
    this.fullscreenMaterial = this.composite
    this.enabled = false
  }

  /** Blur strength, 0..1. Disables the pass at 0. */
  get strength(): number {
    return this.strengthValue
  }

  set strength(value: number) {
    this.strengthValue = value
    this.enabled = frontDoorBlurActive(value)
  }

  override initialize(
    _renderer: WebGLRenderer,
    _alpha: boolean,
    frameBufferType: TextureDataType,
  ): void {
    if (frameBufferType !== undefined) {
      this.targetA.texture.type = frameBufferType
      this.targetB.texture.type = frameBufferType
    }
  }

  override setSize(width: number, height: number): void {
    const { resolutionScale } = POST_FX.frontDoorBlur
    const w = Math.max(1, Math.round(width * resolutionScale))
    const h = Math.max(1, Math.round(height * resolutionScale))
    this.targetA.setSize(w, h)
    this.targetB.setSize(w, h)
    for (const m of [this.downsample, this.kawase]) {
      ;(m.uniforms.texel!.value as Vector2).set(1 / w, 1 / h)
    }
    // The downsample taps sit at the source's texel, a quarter the size of the target's.
    ;(this.downsample.uniforms.texel!.value as Vector2).set(0.5 / width, 0.5 / height)
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    outputBuffer: WebGLRenderTarget | null,
  ): void {
    this.fullscreenMaterial = this.downsample
    this.downsample.uniforms.tInput!.value = inputBuffer.texture
    renderer.setRenderTarget(this.targetA)
    renderer.render(this.scene, this.camera)

    let read = this.targetA
    let write = this.targetB
    for (const offset of POST_FX.frontDoorBlur.kawaseOffsets) {
      this.fullscreenMaterial = this.kawase
      this.kawase.uniforms.tInput!.value = read.texture
      this.kawase.uniforms.offset!.value = offset
      renderer.setRenderTarget(write)
      renderer.render(this.scene, this.camera)
      ;[read, write] = [write, read]
    }

    this.fullscreenMaterial = this.composite
    this.composite.uniforms.tScene!.value = inputBuffer.texture
    this.composite.uniforms.tBlur!.value = read.texture
    this.composite.uniforms.strength!.value = this.strengthValue
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }

  override dispose(): void {
    this.targetA.dispose()
    this.targetB.dispose()
    this.downsample.dispose()
    this.kawase.dispose()
    this.composite.dispose()
    super.dispose()
  }
}
