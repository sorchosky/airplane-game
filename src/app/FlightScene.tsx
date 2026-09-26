import { Canvas } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { PerfHud } from '../debug/PerfHud'
import { PerfProbe } from '../debug/PerfProbe'
import { ShotReady } from '../debug/ShotReady'
import { activeShot, shotFlightState } from '../debug/shots'
import { ChaseCamera } from '../flight/ChaseCamera'
import { Plane } from '../flight/Plane'
import { useFlightStore } from '../flight/flightStore'
import { hasDebugFlag } from '../input/source'
import { PostFX } from '../render/PostFX'
import { QualityGovernor } from '../render/QualityGovernor'
import { Atmosphere } from '../world/Atmosphere'
import { Terrain } from '../world/Terrain'
import { Water } from '../world/Water'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { useGameStore } from './gameStore'

export function FlightScene() {
  const debug = useMemo(() => hasDebugFlag(), [])
  const shot = useMemo(() => activeShot(), [])
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
        setContextGeneration((n) => n + 1)
      },
      { once: true },
    )
  }, [])

  // `?shot=`: park the plane at the bookmark before the first frame, and keep the sim frozen.
  useLayoutEffect(() => {
    if (!shot) return
    const { params } = useFlightStore.getState()
    useFlightStore.setState({ state: shotFlightState(shot, params.cruiseSpeed) })
  }, [shot])

  return (
    <>
      <Canvas
        key={contextGeneration}
        data-context-generation={contextGeneration}
        ref={canvasRef}
        dpr={[1, TERRAIN_CONFIG.maxPixelRatio]}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <Atmosphere />
        <ChaseCamera shot={shot} />
        <Plane paused={paused || shot !== null} />
        <Terrain />
        <Water />
        <PerfProbe />
        <QualityGovernor />
        <PostFX />
      </Canvas>
      <PerfHud initiallyVisible={debug} />
      {shot && <ShotReady />}
    </>
  )
}
