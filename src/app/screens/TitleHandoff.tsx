import { useLayoutEffect, useRef } from 'react'
import { color } from '../../styles/tokens'
import { activeLighting } from '../../world/lightingPreset'
import {
  HANDOFF_EASING,
  TITLE_HANDOFF,
  handoffLayerKeyframes,
  handoffSkyKeyframes,
  handoffVeilKeyframes,
  handoffWordmarkKeyframes,
} from './titleIntro'
import { useTitleHandoffStore } from './titleHandoff'
import { StartButton, StartRow, TitleScrim, TitleWordmark, WordmarkRow } from './TitleText'

const HANDOFF_SKY_MASK = 'linear-gradient(180deg, #000 70%, transparent 100%)'

/**
 * Start → the next screen, as one continuous shot (#73). The title's last sky frame stays up as a
 * still over the freshly mounted scene; the camera sinks through it (the cirrus slides up and
 * swells past), a veil in the world's horizon colour rises as it passes through the cloud, and the
 * layer fades to the live scene underneath. The wordmark and Start lift away first.
 *
 * Plain CSS on an image, not a second WebGL canvas, so the R3F scene boots without competing for a
 * context. Never intercepts input, and never touches the flight camera.
 */
export function TitleHandoff() {
  const still = useTitleHandoffStore((s) => s.still)
  const layerRef = useRef<HTMLDivElement>(null)
  const skyRef = useRef<HTMLDivElement>(null)
  const veilRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const layer = layerRef.current
    const sky = skyRef.current
    const veil = veilRef.current
    const text = textRef.current
    if (!still || !layer || !sky || !veil || !text) return

    const timing: KeyframeAnimationOptions = {
      duration: TITLE_HANDOFF.duration,
      easing: HANDOFF_EASING,
      fill: 'forwards',
    }
    const layerAnimation = layer.animate(handoffLayerKeyframes(), timing)
    const animations = [
      layerAnimation,
      sky.animate(handoffSkyKeyframes(), timing),
      veil.animate(handoffVeilKeyframes(), timing),
      text.animate(handoffWordmarkKeyframes(), {
        duration: TITLE_HANDOFF.wordmark,
        easing: 'cubic-bezier(0.5, 0, 0.75, 0)',
        fill: 'forwards',
      }),
    ]
    layerAnimation.finished.then(
      () => useTitleHandoffStore.getState().end(),
      () => undefined,
    )
    return () => animations.forEach((a) => a.cancel())
  }, [still])

  if (!still) return null

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      data-testid="title-handoff"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        color: color.titleText,
      }}
    >
      <div
        ref={skyRef}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${still})`,
          backgroundSize: '100% 100%',
          // Sinking through the cloud deck: the sky swells from its lower edge and slides up,
          // and the scene below shows through its feathered bottom edge as it clears.
          transformOrigin: '50% 100%',
          maskImage: HANDOFF_SKY_MASK,
          WebkitMaskImage: HANDOFF_SKY_MASK,
        }}
      />
      <div ref={textRef} style={{ position: 'absolute', inset: 0 }}>
        <TitleScrim />
        <WordmarkRow>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <TitleWordmark decorative />
          </div>
        </WordmarkRow>
        <StartRow>
          <StartButton decorative />
        </StartRow>
      </div>
      <div
        ref={veilRef}
        style={{
          position: 'absolute',
          inset: 0,
          background: activeLighting().skyHorizon,
          opacity: 0,
        }}
      />
    </div>
  )
}
