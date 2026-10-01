import { Component, type ReactNode, useEffect, useRef, useState } from 'react'
import { TITLE_SKY_FALLBACK } from '../ui/titleSkyShader'
import { TitleSky, type TitleSkyHandle } from '../ui/TitleSky'
import { FlightScene } from './FlightScene'
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
  const setPosterSnapshot = useWorldStore((s) => s.setPosterSnapshot)
  const skyRef = useRef<TitleSkyHandle>(null)
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

  // Start's hand-off snapshots the poster while it is still up; once it's gone there is none.
  useEffect(() => {
    if (!posterMounted) return
    setPosterSnapshot(() => skyRef.current?.snapshot() ?? null)
    return () => setPosterSnapshot(null)
  }, [posterMounted, setPosterSnapshot])

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
          <TitleSky ref={skyRef} introStart={introStart} />
        </div>
      )}
    </div>
  )
}
