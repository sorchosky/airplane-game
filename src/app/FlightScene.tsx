import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { PerfHud } from '../debug/PerfHud'
import { PerfProbe } from '../debug/PerfProbe'
import { ChaseCamera } from '../flight/ChaseCamera'
import { Plane } from '../flight/Plane'
import { hasDebugFlag } from '../input/source'
import { PostFX } from '../render/PostFX'
import { Atmosphere } from '../world/Atmosphere'
import { Terrain } from '../world/Terrain'
import { Water } from '../world/Water'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { useGameStore } from './gameStore'

export function FlightScene() {
  const debug = useMemo(() => hasDebugFlag(), [])
  const paused = useGameStore((s) => s.state === 'paused')

  return (
    <>
      <Canvas
        dpr={[1, TERRAIN_CONFIG.maxPixelRatio]}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <Atmosphere />
        <ChaseCamera />
        <Plane paused={paused} />
        <Terrain />
        <Water />
        <PerfProbe />
        <PostFX />
      </Canvas>
      <PerfHud initiallyVisible={debug} />
    </>
  )
}
