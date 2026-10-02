import { Canvas, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PerfProbe } from '../debug/PerfProbe'
import { activeShot, shotFlightState } from '../debug/shots'
import { ChaseCamera } from '../flight/ChaseCamera'
import { Plane } from '../flight/Plane'
import { TitleCamera } from '../flight/TitleCamera'
import { FlightVfx } from '../flight/FlightVfx'
import { useFlightStore } from '../flight/flightStore'
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
  // contexts). A new key remounts the canvas with a fresh renderer; the flight, input and game
  // state all live in stores outside it, so the plane carries on where it was.
  const [contextGeneration, setContextGeneration] = useState(0)
  // A callback ref on the canvas element, which exists before the renderer does, so even a loss
  // during startup is caught.
  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    canvas?.addEventListener(
      'webglcontextlost',
      (event) => {
        // Without preventDefault the browser won't even try to restore; we remount instead.
        event.preventDefault()
        // A loss before the first terrain is drawn leaves the title on its poster (and usable);
        // the remounted canvas may still bring the world up and clear that.
        useWorldStore.getState().markFailed()
        setContextGeneration((n) => n + 1)
      },
      { once: true },
    )
  }, [])

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
      <Canvas
        key={contextGeneration}
        data-context-generation={contextGeneration}
        ref={canvasRef}
        frameloop={attract ? 'demand' : capFps ? 'never' : 'always'}
        dpr={dpr}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <Atmosphere />
        {flyby ? <TitleCamera frozen={frozen} /> : <ChaseCamera shot={parked} />}
        <Plane paused={paused || parked !== null} scripted={flyby} frozen={frozen} />
        <FlightVfx paused={paused || parked !== null || flyby} />
        {parked === null && spawned && <GoldenPath paused={paused} />}
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
        {attract && <AttractFrames covered={covered} />}
      </Canvas>
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
