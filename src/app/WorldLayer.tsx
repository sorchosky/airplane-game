import { Component, type ReactNode, useEffect, useRef, useState } from 'react'
import { TITLE_SKY_FALLBACK } from '../ui/titleSkyShader'
import { postFxConfig } from '../render/postFx'
import { useQualityStore } from '../render/qualityStore'
import { color, effect } from '../styles/tokens'
import { START_TRANSITION } from './screens/startTransition'
import { TitleSky } from '../ui/TitleSky'
import { FlightScene } from './FlightScene'
import { useFrontDoorLookStore } from './frontDoorLookStore'
import type { SceneMode } from './sceneMode'
import { shouldPlayIntro } from './screens/titleIntro'
import { WORLD_FADE_MS } from './worldReadiness'
import { useWorldStore } from './worldStore'

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** A world that throws while booting (no WebGL, a failed renderer) leaves the poster up. */
class WorldBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('The world failed to start', error)
    useWorldStore.getState().markFailed()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

interface WorldLayerProps {
  mode: SceneMode
  covered: boolean
}

/**
 * The persistent world (#153): one canvas from the title on, behind every screen. `TitleSky`
 * covers it as a poster while the first terrain streams in, then the world shows through over
 * `WORLD_FADE_MS` and the poster unmounts, leaving one WebGL context. If the world never starts,
 * the poster stays and the title is still usable.
 */
export function WorldLayer({ mode, covered }: WorldLayerProps) {
  const status = useWorldStore((s) => s.status)
  const [posterMounted, setPosterMounted] = useState(true)
  // Decided once, with `TitleScreen`'s first mount: the cirrus drifts while the intro plays.
  const [introStart] = useState(() =>
    shouldPlayIntro(false, prefersReducedMotion()) ? performance.now() : null,
  )
  const [fadeMs] = useState(() => (prefersReducedMotion() ? 0 : WORLD_FADE_MS))

  useEffect(() => {
    if (status !== 'ready') return
    const timer = window.setTimeout(() => setPosterMounted(false), fadeMs)
    return () => window.clearTimeout(timer)
  }, [status, fadeMs])

  return (
    // Behind the screens (the app root is its own stacking context), above its background.
    <div
      data-testid="world"
      data-world-status={status}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: -1,
        overflow: 'hidden',
        background: TITLE_SKY_FALLBACK,
      }}
    >
      <WorldBoundary>
        <FlightScene mode={mode} covered={covered} />
      </WorldBoundary>
      {posterMounted && (
        <div
          data-testid="world-poster"
          style={{
            position: 'absolute',
            inset: 0,
            opacity: status === 'ready' ? 0 : 1,
            transition: `opacity ${fadeMs}ms ease-out`,
            pointerEvents: 'none',
          }}
        >
          <TitleSky introStart={introStart} />
        </div>
      )}
      <FrozenStill />
    </div>
  )
}

/**
 * The low tier's blur (#159): it has no composer, so on Start the world is held on a downscaled
 * still of its last frame and that still is CSS-blurred once and faded in with the blur strength.
 * It is a filter on an image, never a `backdrop-filter` over the live canvas. Back fades it out
 * and lets the world draw again. Updated from the look store, not React, since the strength moves
 * every frame; the blur radius itself never changes, so the still is rasterised once.
 */
function FrozenStill() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const stillRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    const still = stillRef.current
    if (!wrapper || !still) return
    let captured = false
    const apply = (blur: number) => {
      const look = useFrontDoorLookStore.getState()
      // Medium and high blur in the composer.
      if (postFxConfig(useQualityStore.getState().tier).enabled) return
      if (blur > 0 && !captured) {
        captured = look.captureStill?.(still) ?? false
        if (captured) look.setHeld(true)
      }
      if (!captured) return
      wrapper.style.opacity = String(blur)
      wrapper.style.transform = `scale(${1 + START_TRANSITION.stillScale * blur})`
      if (blur === 0) {
        captured = false
        look.setHeld(false)
      }
    }
    apply(useFrontDoorLookStore.getState().blur)
    return useFrontDoorLookStore.subscribe((s, previous) => {
      if (s.blur !== previous.blur) apply(s.blur)
    })
  }, [])

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      data-testid="world-still"
      style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }}
    >
      <canvas
        ref={stillRef}
        style={{ width: '100%', height: '100%', display: 'block', filter: effect.stillBlur }}
      />
      <div style={{ position: 'absolute', inset: 0, background: color.frontDoorScrim }} />
    </div>
  )
}
