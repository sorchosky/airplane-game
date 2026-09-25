import { RenderPass } from 'postprocessing'
import {
  ACESFilmicToneMapping,
  LinearSRGBColorSpace,
  type ToneMapping,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'

/**
 * The tone mapping the scene is authored against: R3F's renderer default, which every material
 * got before post-processing existed. `<EffectComposer>` switches the renderer to
 * `NoToneMapping`, so this pass puts it back for the scene render only.
 */
const SCENE_TONE_MAPPING: ToneMapping = ACESFilmicToneMapping

/** Holds the XR flag we borrow. Declared here because `WebGLRenderTarget` types don't expose it. */
type FlaggableTarget = WebGLRenderTarget & { isXRRenderTarget?: boolean }

/**
 * Renders the scene into the composer's buffer exactly as it would look on the canvas.
 *
 * Three.js only tone maps materials when drawing to the canvas (or an XR target), so a plain
 * `RenderPass` would lose the ACES curve every toon material is tuned for. Marking the buffer as
 * an XR target for the duration of the draw makes three.js treat it like the screen: materials
 * tone map with the renderer's setting and write in the buffer's colour space, which is linear
 * so the effects that follow work on linear light. The sky and haze convert themselves for this
 * case (see `atmosphereShader.ts`).
 *
 * It also takes over resetting `renderer.info` once per frame, so the perf HUD counts the scene
 * and every effect pass together rather than only the last full-screen draw. `PostFX` turns off
 * `info.autoReset` while the composer is mounted.
 */
export class DisplayRenderPass extends RenderPass {
  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLRenderTarget | null,
    deltaTime?: number,
    stencilTest?: boolean,
  ): void {
    renderer.info.reset()
    const target = inputBuffer as FlaggableTarget | null
    const previousToneMapping = renderer.toneMapping
    renderer.toneMapping = SCENE_TONE_MAPPING
    if (target !== null) {
      target.isXRRenderTarget = true
      target.texture.colorSpace = LinearSRGBColorSpace
    }
    try {
      super.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest)
    } finally {
      if (target !== null) target.isXRRenderTarget = false
      renderer.toneMapping = previousToneMapping
    }
  }
}
