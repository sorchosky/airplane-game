import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { IcosahedronGeometry, InstancedMesh, MeshLambertMaterial, Object3D } from 'three'
import { useFlightStore } from '../flight/flightStore'
import { color } from '../styles/tokens'
import { CLOUD_CONFIG, cloudLayout, wrapAround } from './atmosphere'

/**
 * Drifting cumulus clusters, one instanced mesh (one draw call) of low-poly puffs. Clusters live
 * in a square window centred on the player: as the wind carries them, or the plane flies away,
 * one that crosses an edge reappears at the opposite edge. That edge is past the haze's full
 * fade, so the jump is invisible.
 *
 * Plain flat-shaded Lambert for now. Switch to the toon material factory once #21 lands.
 */
export function Clouds() {
  const puffs = useMemo(() => cloudLayout(CLOUD_CONFIG), [])
  const mesh = useMemo(() => {
    const geometry = new IcosahedronGeometry(1, 1)
    // A little warm self-light keeps the low sun from turning the shaded undersides grey-brown.
    const material = new MeshLambertMaterial({
      color: color.snow,
      emissive: color.fog,
      emissiveIntensity: 0.35,
      flatShading: true,
    })
    const instanced = new InstancedMesh(geometry, material, puffs.length)
    // Instances span kilometres; the default bounds (one puff at the origin) would cull them all.
    instanced.frustumCulled = false
    return instanced
  }, [puffs])
  const dummy = useMemo(() => new Object3D(), [])
  const elapsed = useRef(0)

  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as MeshLambertMaterial).dispose()
      mesh.dispose()
    },
    [mesh],
  )

  useFrame((_state, delta) => {
    elapsed.current += delta
    const t = elapsed.current
    const { position } = useFlightStore.getState().state
    const { fieldSize, windX, windZ } = CLOUD_CONFIG
    // A plain loop, not `forEach`: no per-frame closure, nothing allocated.
    for (let i = 0; i < puffs.length; i++) {
      const puff = puffs[i]
      if (!puff) continue
      const x = wrapAround(puff.clusterX + windX * t, position.x, fieldSize)
      const z = wrapAround(puff.clusterZ + windZ * t, position.z, fieldSize)
      dummy.position.set(x + puff.offsetX, puff.y, z + puff.offsetZ)
      // Squash vertically a little: wide, flat-bottomed puffs read as cumulus, not balls.
      dummy.scale.set(puff.radius, puff.radius * 0.75, puff.radius)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <primitive object={mesh} />
}
