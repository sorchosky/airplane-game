import { Canvas } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { PerfProbe } from '../debug/PerfProbe'
import { activeShot, shotFlightState } from '../debug/shots'
import { ChaseCamera } from '../flight/ChaseCamera'
import { Plane } from '../flight/Plane'
import { TitleCamera } from '../flight/TitleCamera'
import { FlightVfx } from '../flight/FlightVfx'
import { useFlightStore } from '../flight/flightStore'
import { PostFX } from '../render/PostFX'
import { QualityGovernor } from '../render/QualityGovernor'
import { CloudVeil } from '../ui/CloudVeil'
import { Atmosphere } from '../world/Atmosphere'
import { Foliage } from '../world/Foliage'
import { GoldenPath } from '../world/GoldenPath'
import { Landmarks } from '../world/Landmarks'
import { Terrain } from '../world/Terrain'
import { Water } from '../world/Water'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { AttractFrames } from './AttractFrames'
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

  // Park the plane at the bookmark before the first frame, and put it back at the spawn when
  // flight begins. `?shot=` keeps its bookmark in flight too, with the sim frozen. `spawned` holds
  // back what reads the plane's position when it mounts (the golden path) until the reset is in.
  const [spawned, setSpawned] = useState(false)
  useLayoutEffect(() => {
    if (flyby) {
      // The flyby writes the plane's state every frame; there is no sim to reset.
      setSpawned(false)
    } else if (parked) {
      const { params } = useFlightStore.getState()
      useFlightStore.setState({ state: shotFlightState(parked, params.cruiseSpeed) })
      setSpawned(false)
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
        frameloop={attract ? 'demand' : 'always'}
        dpr={[1, TERRAIN_CONFIG.maxPixelRatio]}
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
        <QualityGovernor paused={attract} />
        <PostFX />
        <WorldWatcher />
        {attract && <AttractFrames covered={covered} />}
      </Canvas>
      <CloudVeil />
    </>
  )
}
