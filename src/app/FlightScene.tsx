import { Canvas } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { PerfHud } from '../debug/PerfHud'
import { PerfProbe } from '../debug/PerfProbe'
import { ShotReady } from '../debug/ShotReady'
import { activeShot, shotFlightState } from '../debug/shots'
import { ChaseCamera } from '../flight/ChaseCamera'
import { Plane } from '../flight/Plane'
import { useFlightStore } from '../flight/flightStore'
import { hasDebugFlag } from '../input/source'
import { PostFX } from '../render/PostFX'
import { Atmosphere } from '../world/Atmosphere'
import { Terrain } from '../world/Terrain'
import { Water } from '../world/Water'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { useGameStore } from './gameStore'

export function FlightScene() {
  const debug = useMemo(() => hasDebugFlag(), [])
  const shot = useMemo(() => activeShot(), [])
  const paused = useGameStore((s) => s.state === 'paused')

  // `?shot=`: park the plane at the bookmark before the first frame, and keep the sim frozen.
  useLayoutEffect(() => {
    if (!shot) return
    const { params } = useFlightStore.getState()
    useFlightStore.setState({ state: shotFlightState(shot, params.cruiseSpeed) })
  }, [shot])

  return (
    <>
      <Canvas
        dpr={[1, TERRAIN_CONFIG.maxPixelRatio]}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <Atmosphere />
        <ChaseCamera shot={shot} />
        <Plane paused={paused || shot !== null} />
        <Terrain />
        <Water />
        <PerfProbe />
        <PostFX />
      </Canvas>
      <PerfHud initiallyVisible={debug} />
      {shot && <ShotReady />}
    </>
  )
}
