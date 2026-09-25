import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { FpsCounter } from '../debug/FpsCounter'
import { PerfProbe } from '../debug/PerfProbe'
import { ChaseCamera } from '../flight/ChaseCamera'
import { Plane } from '../flight/Plane'
import { hasDebugFlag } from '../input/source'
import { color } from '../styles/tokens'
import { Terrain } from '../world/Terrain'
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
        <color attach="background" args={[color.skyZenith]} />
        <directionalLight position={[5, 8, 3]} intensity={1.5} />
        <ambientLight intensity={0.4} />
        <ChaseCamera />
        <Plane paused={paused} />
        <Terrain />
        <PerfProbe />
      </Canvas>
      <FpsCounter initiallyVisible={debug} />
    </>
  )
}
