import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { useInputStore } from '../input/inputStore'
import { color } from '../styles/tokens'
import { heightAt } from '../world/heightfield'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { useFlightStore } from './flightStore'

/**
 * Placeholder box-and-wings mesh driven by the flight model. Swapped for the procedural
 * Cessna-style model in #23; this ticket only needs something that visibly banks, pitches and
 * moves so the flight model can be exercised with `?input=keyboard`.
 */
export function Plane() {
  const groupRef = useRef<Group>(null)

  useFrame((_frameState, delta) => {
    const input = useInputStore.getState().current
    const { position } = useFlightStore.getState().state
    const groundHeight = heightAt(position.x, position.z, TERRAIN_CONFIG)
    useFlightStore.getState().tick(input, delta, groundHeight)

    const group = groupRef.current
    if (!group) return
    const { state } = useFlightStore.getState()
    group.position.copy(state.position)
    group.quaternion.copy(state.orientation)
  })

  return (
    <group ref={groupRef}>
      <mesh castShadow>
        <boxGeometry args={[1, 0.6, 2.4]} />
        <meshStandardMaterial color={color.accent} />
      </mesh>
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[4, 0.08, 0.6]} />
        <meshStandardMaterial color={color.accent} />
      </mesh>
      <mesh position={[0, 0.35, 1.05]} castShadow>
        <boxGeometry args={[0.08, 0.7, 0.5]} />
        <meshStandardMaterial color={color.accent} />
      </mesh>
    </group>
  )
}
