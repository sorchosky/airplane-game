import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  DataTexture,
  LinearFilter,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  Vector3,
  type Mesh,
} from 'three'
import { color } from '../styles/tokens'
import { SUN_DIRECTION } from '../world/atmosphere'
import { heightAt, normalAt, surfaceHeightAt } from '../world/heightfield'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { useFlightStore } from './flightStore'
import { SHADOW_BLOB_PARAMS, buildShadowAlphaData, shadowAnchor, shadowBlob } from './shadowBlob'

const ALPHA_SIZE = 64
const UP = new Vector3(0, 1, 0)
const surfaceAt = (x: number, z: number) => surfaceHeightAt(x, z, TERRAIN_CONFIG)

/**
 * The plane's contact shadow: one soft dark disc laid on the ground (or the lake surface) where the
 * sun would cast the plane, sized and faded by height (`shadowBlob.ts`). No shadow map and no
 * raycast: `shadowAnchor` walks the sun's ray by sampling the heightfield, and the disc tilts to
 * `normalAt` there. One draw call while visible, none
 * above `fadeEnd`. Reads `flightStore` in `useFrame`, like `Plane`, so it follows a parked
 * `?shot=` plane too.
 */
export function ContactShadow() {
  const meshRef = useRef<Mesh>(null)
  const { geometry, material, alphaMap } = useMemo(() => {
    const alphaMap = new DataTexture(buildShadowAlphaData(ALPHA_SIZE), ALPHA_SIZE, ALPHA_SIZE)
    alphaMap.format = RGBAFormat
    alphaMap.magFilter = LinearFilter
    alphaMap.minFilter = LinearFilter
    alphaMap.needsUpdate = true
    const material = new MeshBasicMaterial({
      // The outline's cool near-black: shadows in this palette are blue, not brown.
      color: color.outline,
      alphaMap,
      transparent: true,
      depthWrite: false,
      // The terrain mesh is a coarser triangulation than `heightAt`; pull the disc toward the
      // camera in depth so it isn't swallowed where the two disagree by a few centimetres.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    })
    // A 2 m square in the XZ plane (radius 1 before scaling), facing +Y.
    const geometry = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
    return { geometry, material, alphaMap }
  }, [])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
      alphaMap.dispose()
    },
    [geometry, material, alphaMap],
  )

  const scratch = useRef({
    anchor: { x: 0, y: 0, z: 0, height: 0 },
    blob: { radius: 0, opacity: 0 },
    normal: new Vector3(),
  })

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const { position } = useFlightStore.getState().state
    const { anchor, blob, normal } = scratch.current
    shadowAnchor(position.x, position.y, position.z, SUN_DIRECTION, surfaceAt, anchor)
    shadowBlob(anchor.height, SHADOW_BLOB_PARAMS, blob)
    mesh.visible = blob.opacity > 0.005
    if (!mesh.visible) return

    const overWater = heightAt(anchor.x, anchor.z, TERRAIN_CONFIG) < TERRAIN_CONFIG.waterLevel
    if (overWater) normal.copy(UP)
    else normal.fromArray(normalAt(anchor.x, anchor.z, TERRAIN_CONFIG, 2))
    mesh.quaternion.setFromUnitVectors(UP, normal)
    mesh.position.set(anchor.x, anchor.y, anchor.z).addScaledVector(normal, SHADOW_BLOB_PARAMS.lift)
    mesh.scale.setScalar(blob.radius)
    material.opacity = blob.opacity
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      visible={false}
      // Moves with the plane and is tiny: skip the culling test rather than keep bounds current.
      frustumCulled={false}
    />
  )
}
