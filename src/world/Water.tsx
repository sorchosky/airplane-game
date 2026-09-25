import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { useFlightStore } from '../flight/flightStore'
import { TERRAIN_CONFIG } from './terrainConfig'
import { createWaterMaterial, waterTimeUniform } from './waterShader'

/**
 * m, edge of the water square. Reaches past the terrain's view distance in every direction, so its
 * edge is always beyond the haze's full fade (and the camera's far plane).
 */
const WATER_SIZE = TERRAIN_CONFIG.viewDistance * 2.4

/**
 * One big water plane at `waterLevel`, re-centred under the plane every frame. The terrain pokes
 * through it everywhere except in lakes and river channels carved below the water line. The
 * shader animates in world space, so sliding the plane along never makes the surface swim.
 */
export function Water() {
  const meshRef = useRef<Mesh>(null)
  const material = useMemo(() => createWaterMaterial(), [])

  useEffect(() => () => material.dispose(), [material])

  useFrame((_state, delta) => {
    waterTimeUniform.value += delta
    const mesh = meshRef.current
    if (!mesh) return
    const { position } = useFlightStore.getState().state
    mesh.position.set(position.x, TERRAIN_CONFIG.waterLevel, position.z)
  })

  return (
    // Drawn first among transparent objects: everything else see-through (clouds) sits above it.
    <mesh
      ref={meshRef}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={-1}
      frustumCulled={false}
    >
      <planeGeometry args={[WATER_SIZE, WATER_SIZE]} />
    </mesh>
  )
}
