import { Canvas, useThree } from '@react-three/fiber'
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { PerfProbe } from '../debug/PerfProbe'
import { activeShot, shotFlightState } from '../debug/shots'
import { ChaseCamera } from '../flight/ChaseCamera'
import { Plane } from '../flight/Plane'
import { TitleCamera } from '../flight/TitleCamera'
import { FlightVfx } from '../flight/FlightVfx'
import { useFlightStore } from '../flight/flightStore'
import { WorldWrap } from '../flight/WorldWrap'
import { PostFX } from '../render/PostFX'
import { QualityGovernor } from '../render/QualityGovernor'
import { useQualityStore } from '../render/qualityStore'
import { CloudVeil } from '../ui/CloudVeil'
import { Atmosphere } from '../world/Atmosphere'
import { Foliage } from '../world/Foliage'
import { GoldenPath } from '../world/GoldenPath'
import { Landmarks } from '../world/Landmarks'
import { Terrain } from '../world/Terrain'
import { Water } from '../world/Water'
import { surfaceHeightAt } from '../world/heightfield'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { AttractFrames } from './AttractFrames'
import { CastFrameLoop } from './CastFrameLoop'
import { CONTEXT_HEALTHY_MS, contextRetryDelayMs } from './contextRetry'
import { useFrontDoorLookStore } from './frontDoorLookStore'
import { useGameStore } from './gameStore'
import type { SceneMode } from './sceneMode'
import { WorldWatcher } from './WorldWatcher'
import { useWorldStore } from './worldStore'

interface FlightSceneProps {
  /**
   * `attract`: the scripted title flyby (or a `?shot=` bookmark), the sim doesn't step, frames
   * capped. `flight`: the normal sim and chase camera. The canvas is the same one in both.
   */
  mode: SceneMode
  /** Attract only: an opaque screen covers the world, so the last frame is held. */
  covered?: boolean
}

/**
 * The persistent world (#153): mounted from the title on and never remounted by a mode change.
 * Overlays that belong to flight (HUD, prompts, touch controls) live outside, in `App`.
 */
export function FlightScene({ mode, covered = false }: FlightSceneProps) {
  const shot = useMemo(() => activeShot(), [])
  const attract = mode === 'attract'
  // The governor owns the pixel ratio. R3F re-applies the Canvas `dpr` prop on every render, so
  // passing a fixed range here would undo the governor's step whenever this component re-rendered.
  const dpr = useQualityStore((s) => s.dpr)
  // Capped at 30 fps for the screen mirror (#27): by `?cast`, or when the governor can't hold 60.
  const capFps = useQualityStore((s) => s.capFps)
  // The title flyby (#157) flies the plane in attract, except under a `?shot=` for another view.
  const flyby = attract && (shot === null || shot.name === 'title')
  // `?shot=title` and reduced motion hold the loop at its named frame.
  const frozen = useMemo(
    () => shot !== null || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [shot],
  )
  // The bookmark the plane is parked at: `?shot=` always, unless the flyby is flying it.
  const parked = flyby ? null : shot
  const paused = useGameStore((s) => s.state === 'paused')
  // Bumped when the GPU drops the WebGL context (backgrounded tab on iOS, driver reset, too many
  // contexts) or a new canvas can't get one. A new key remounts the canvas with a fresh renderer;
  // the flight, input and game state all live in stores outside it, so the plane carries on where
  // it was.
  const [contextGeneration, setContextGeneration] = useState(0)
  // Failures in a row: lost contexts and canvases whose renderer couldn't be created. A canvas
  // that keeps its context for `CONTEXT_HEALTHY_MS` clears the count.
  const failures = useRef(0)
  const retryTimer = useRef<number | undefined>(undefined)
  const healthyTimer = useRef<number | undefined>(undefined)
  const remount = useCallback(() => {
    // One remount per failure: a loss can also surface as a render error from the same canvas.
    if (retryTimer.current !== undefined) return
    window.clearTimeout(healthyTimer.current)
    failures.current += 1
    const delay = contextRetryDelayMs(failures.current, useWorldStore.getState().status === 'ready')
    // Never drew and kept failing: no usable WebGL here. The poster stays.
    if (delay === null) return
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = undefined
      setContextGeneration((n) => n + 1)
    }, delay)
  }, [])
  const onCreated = useCallback(() => {
    window.clearTimeout(healthyTimer.current)
    healthyTimer.current = window.setTimeout(() => (failures.current = 0), CONTEXT_HEALTHY_MS)
  }, [])
  useEffect(
    () => () => {
      window.clearTimeout(retryTimer.current)
      window.clearTimeout(healthyTimer.current)
    },
    [],
  )
  // A callback ref on the canvas element, which exists before the renderer does, so even a loss
  // during startup is caught. R3F calls it again on every render with the same element; one
  // listener per canvas.
  const watched = useRef(new WeakSet<HTMLCanvasElement>())
  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || watched.current.has(canvas)) return
      watched.current.add(canvas)
      canvas.addEventListener(
        'webglcontextlost',
        (event) => {
          // Without preventDefault the browser won't even try to restore; we remount instead.
          event.preventDefault()
          // A loss before the first terrain is drawn leaves the title on its poster (and usable);
          // the remounted canvas may still bring the world up and clear that.
          useWorldStore.getState().markFailed()
          remount()
        },
        { once: true },
      )
    },
    [remount],
  )

  // Park the plane at the bookmark before the first frame. When flight begins the sim takes over
  // the flyby plane where it was last drawn (#161), or starts at the spawn without one. `?shot=`
  // keeps its bookmark in flight too, with the sim frozen. `spawned` holds back what reads the
  // plane's position when it mounts (the golden path) until the plane is placed.
  const [spawned, setSpawned] = useState(false)
  const wasFlyby = useRef(false)
  useLayoutEffect(() => {
    const fromFlyby = wasFlyby.current
    wasFlyby.current = flyby
    if (flyby) {
      // The flyby writes the plane's state every frame; there is no sim to reset.
      setSpawned(false)
    } else if (parked) {
      const { params } = useFlightStore.getState()
      useFlightStore.setState({ state: shotFlightState(parked, params.cruiseSpeed) })
      setSpawned(false)
    } else if (fromFlyby) {
      const { x, z } = useFlightStore.getState().state.position
      useFlightStore.getState().takeOverFromFlyby(surfaceHeightAt(x, z, TERRAIN_CONFIG))
      setSpawned(true)
    } else {
      useFlightStore.getState().reset()
      setSpawned(true)
    }
  }, [parked, flyby])

  return (
    <>
      <CanvasBoundary key={contextGeneration} onError={remount}>
        <Canvas
          data-context-generation={contextGeneration}
          ref={canvasRef}
          onCreated={onCreated}
          frameloop={attract ? 'demand' : capFps ? 'never' : 'always'}
          dpr={dpr}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <WorldWrap />
          <Atmosphere />
          {flyby ? <TitleCamera frozen={frozen} /> : <ChaseCamera shot={parked} />}
          <Plane paused={paused || parked !== null} scripted={flyby} frozen={frozen} />
          <FlightVfx paused={paused || parked !== null || flyby} />
          {/* Parked at a bookmark, the gates show for the shot but count nothing. */}
          {(spawned || parked !== null) && <GoldenPath paused={paused || parked !== null} />}
          <Terrain />
          <Foliage />
          <Water />
          <Landmarks />
          <PerfProbe />
          {capFps && !attract && <CastFrameLoop fps={capFps} />}
          <QualityGovernor paused={attract} />
          <PostFX />
          <WorldWatcher />
          <StillCapture />
          {attract && <ShaderWarmup />}
          {attract && <AttractFrames covered={covered} />}
        </Canvas>
      </CanvasBoundary>
      <CloudVeil />
    </>
  )
}

/** The still is drawn at this fraction of the canvas: it is blurred anyway, and it is cheap to hold. */
const STILL_SCALE = 0.25

/**
 * Registers how the low tier (no composer) takes its still of the world for the front door blur
 * (#159): one render and a downscaled copy into a 2D canvas, in the same task so the drawing
 * buffer is still there to read. The blur itself is CSS on that still, applied once.
 */
function StillCapture() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    const capture = (target: HTMLCanvasElement): boolean => {
      const source = gl.domElement
      const width = Math.max(1, Math.round(source.width * STILL_SCALE))
      const height = Math.max(1, Math.round(source.height * STILL_SCALE))
      const context = target.getContext('2d')
      if (!context) return false
      gl.render(scene, camera)
      target.width = width
      target.height = height
      context.drawImage(source, 0, 0, width, height)
      return true
    }
    useFrontDoorLookStore.getState().setCaptureStill(capture)
    return () => useFrontDoorLookStore.getState().setCaptureStill(null)
  }, [gl, scene, camera])
  return null
}

/** Compile world materials while the title is running, before flight can reveal them. */
function ShaderWarmup() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    void gl.compileAsync(scene, camera)
  }, [gl, scene, camera])
  return null
}

/**
 * Catches a canvas that couldn't start (the GPU refused a new context, often right after a loss)
 * and hands it to the retry, instead of letting `WorldLayer`'s boundary drop the world for good.
 * Keyed by the context generation, so each new canvas starts with a clean boundary.
 */
class CanvasBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('The world canvas failed; trying a new one', error)
    useWorldStore.getState().markFailed()
    this.props.onError()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
