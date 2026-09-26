import { useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette, wrapEffect } from '@react-three/postprocessing'
import { useEffect, useState } from 'react'
import type { Camera, Scene } from 'three'
import { activeLighting } from '../world/lightingPreset'
import { DisplayRenderPass } from './DisplayRenderPass'
import { GodRaysEffect } from './GodRaysEffect'
import { gradeParams, POST_FX, postFxConfig } from './postFx'
import { useQualityStore } from './qualityStore'
import { WarmLiftEffect } from './WarmLiftEffect'

const WarmLift = wrapEffect(WarmLiftEffect)
const GodRays = wrapEffect(GodRaysEffect)

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const createRenderPass = (scene: Scene, camera: Camera) => new DisplayRenderPass(scene, camera)

/**
 * Bloom, god rays, two-tone grade and vignette on top of the scene, sized by the quality tier.
 * Mount inside the `<Canvas>`. On `low` it renders nothing and R3F draws the scene straight to
 * the canvas.
 */
export function PostFX() {
  const tier = useQualityStore((s) => s.tier)
  const [reducedMotion] = useState(prefersReducedMotion)
  const config = postFxConfig(tier, { reducedMotion })
  if (!config.enabled) return null
  const lighting = activeLighting()
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
        {config.godRays && <GodRays sunDirection={lighting.sunDirection} tint={lighting.sunGlow} />}
        {config.grade && <WarmLift {...gradeParams(lighting)} />}
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
