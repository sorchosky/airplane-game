import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { useInputStore } from '../input/inputStore'
import { surfaceHeightAt } from '../world/heightfield'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { useFlightStore } from './flightStore'
import { PlaneModel } from './PlaneModel'

interface PlaneProps {
  /** Freezes the simulation while the game is paused. */
  paused: boolean
}

/** Steps the flight model each frame and places the plane model at the result. */
export function Plane({ paused }: PlaneProps) {
  const groupRef = useRef<Group>(null)

  useFrame((_frameState, delta) => {
    // Paused freezes the sim: the flight step isn't called, so nothing accumulates. The model
    // still follows the store, so a plane parked by `?shot=` (or reset) is placed on its first frame.
    if (!paused) {
      const input = useInputStore.getState().current
      const { position } = useFlightStore.getState().state
      const groundHeight = surfaceHeightAt(position.x, position.z, TERRAIN_CONFIG)
      useFlightStore.getState().tick(input, delta, groundHeight)
    }

    const group = groupRef.current
    if (!group) return
    const { state } = useFlightStore.getState()
    group.position.copy(state.position)
    group.quaternion.copy(state.orientation)
  })

  return (
    <group ref={groupRef}>
      <PlaneModel paused={paused} />
    </group>
  )
}
