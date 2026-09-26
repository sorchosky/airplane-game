import { useThree } from '@react-three/fiber'
import {
  Bloom,
  EffectComposer,
  HueSaturation,
  Vignette,
  wrapEffect,
} from '@react-three/postprocessing'
import { useEffect } from 'react'
import type { Camera, Scene } from 'three'
import { color } from '../styles/tokens'
import { DisplayRenderPass } from './DisplayRenderPass'
import { POST_FX, postFxConfig } from './postFx'
import { useQualityStore } from './qualityStore'
import { WarmLiftEffect } from './WarmLiftEffect'

const WarmLift = wrapEffect(WarmLiftEffect)

const createRenderPass = (scene: Scene, camera: Camera) => new DisplayRenderPass(scene, camera)

/**
 * Bloom, warm grade and vignette on top of the scene, sized by the quality tier. Mount inside
 * the `<Canvas>`. On `low` it renders nothing and R3F draws the scene straight to the canvas.
 */
export function PostFX() {
  const tier = useQualityStore((s) => s.tier)
  const config = postFxConfig(tier)
  if (!config.enabled) return null
  return (
    <>
      <FrameInfoManualReset />
      <EffectComposer
        multisampling={POST_FX.multisampling}
        renderPass={createRenderPass}
        enableNormalPass={false}
      >
        <Bloom
          mipmapBlur
          luminanceThreshold={POST_FX.bloom.threshold}
          luminanceSmoothing={POST_FX.bloom.smoothing}
          intensity={POST_FX.bloom.intensity}
          radius={POST_FX.bloom.radius}
          resolutionScale={config.bloomResolutionScale}
        />
        {config.grade && <WarmLift tint={color.sun} lift={POST_FX.grade.lift} />}
        {config.grade && <HueSaturation saturation={POST_FX.grade.saturation} />}
        {config.vignette && (
          <Vignette offset={POST_FX.vignette.offset} darkness={POST_FX.vignette.darkness} />
        )}
      </EffectComposer>
    </>
  )
}

/** `DisplayRenderPass` resets `renderer.info` itself while the composer runs. See its docs. */
function FrameInfoManualReset() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const previous = gl.info.autoReset
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = previous
    }
  }, [gl])
  return null
}
