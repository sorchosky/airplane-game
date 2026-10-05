import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Group } from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { activeShot } from '../debug/shots'
import { planBoats } from './boatPlan'
import { boatTimeUniform, createBoatMaterial, createBoatOutlineMaterial } from './landmarkMaterials'
import { buildBoats } from './models/boats'
import { getTown } from './town'
import { TERRAIN_CONFIG } from './terrainConfig'
import { imageShift } from './wrap'

/**
 * The fishing boats at the town's finger piers and the sailboats out on the sea (#225): two draw
 * calls, one merged toon mesh and its outline hull. Their bob, roll, sway and loops are all in the
 * vertex shader, so a frame writes one uniform. The clock stands still under reduced motion and
 * at `?shot=`, which parks the boats for a repeatable capture.
 */
export function Boats() {
  const town = getTown()
  const meshes = useMemo(() => {
    const solid = buildBoats(planBoats(town.layout))
    return { solid, hull: toCreasedNormals(solid, Math.PI) }
  }, [town])
  const material = useMemo(() => createBoatMaterial(), [])
  const outline = useMemo(() => createBoatOutlineMaterial(), [])
  const group = useRef<Group>(null)
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null,
    [],
  )

  useEffect(
    () => () => {
      meshes.solid.dispose()
      meshes.hull.dispose()
      material.dispose()
      outline.dispose()
    },
    [meshes, material, outline],
  )

  useFrame(({ camera }, delta) => {
    // The world wraps (#177): the boats stand at the town's copy nearest the camera.
    const period = TERRAIN_CONFIG.worldPeriod
    group.current?.position.set(
      town.x + imageShift(town.x, camera.position.x, period),
      town.y,
      town.z + imageShift(town.z, camera.position.z, period),
    )
    if (!reduced?.matches && !activeShot()) boatTimeUniform.value += delta
  })

  // The vertices are in each boat's own frame and move in the shader, so the geometry's bounds
  // say nothing about where a boat is: never cull by them.
  return (
    <group ref={group} position={[town.x, town.y, town.z]}>
      <mesh geometry={meshes.solid} material={material} frustumCulled={false}>
        <mesh
          geometry={meshes.hull}
          material={outline}
          frustumCulled={false}
          raycast={() => undefined}
        />
      </mesh>
    </group>
  )
}
