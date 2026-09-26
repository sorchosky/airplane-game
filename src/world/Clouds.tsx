import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, InstancedMesh, Object3D, PlaneGeometry } from 'three'
import { activeShot } from '../debug/shots'
import { useFlightStore } from '../flight/flightStore'
import { wrapAround } from './atmosphere'
import { createCumulusMaterial, createStratusMaterial } from './cloudMaterial'
import {
  buildHeapGeometry,
  CLOUD_BURST,
  CUMULUS_CONFIG,
  cumulusLayout,
  heapDepth,
  insertNearest,
  pushAmount,
  STRATUS_CONFIG,
  stratusLayout,
} from './cloudMath'
import { useCloudStore } from './cloudStore'

/**
 * Two cloud layers, two draw calls (#70):
 * - Mid-layer cumulus: one instanced mesh of lofted, flat-bottomed heaps, two-band toon shaded
 *   with a soft fresnel edge (`cloudMaterial.ts`).
 * - High stratus: one instanced mesh of camera-facing billboard streaks.
 *
 * Both live in a square window centred on the player: as the wind carries them, or the plane flies
 * away, one that crosses an edge reappears at the opposite edge. That edge is past the haze's full
 * fade, so the jump is invisible.
 *
 * Flying into a heap starts a burst: the six nearest heaps are pushed aside and ease back, and
 * `cloudStore` counts the burst for the screen veil and audio.
 */
export function Clouds() {
  const puffs = useMemo(() => cumulusLayout(CUMULUS_CONFIG), [])
  const sheets = useMemo(() => stratusLayout(STRATUS_CONFIG), [])

  const cumulus = useMemo(() => {
    const { positions, normals, indices } = buildHeapGeometry()
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new BufferAttribute(normals, 3))
    geometry.setIndex(new BufferAttribute(indices, 1))
    const mesh = new InstancedMesh(geometry, createCumulusMaterial(), puffs.length)
    // Instances span kilometres; the default bounds (one heap at the origin) would cull them all.
    mesh.frustumCulled = false
    return mesh
  }, [puffs])

  const stratus = useMemo(() => {
    const mesh = new InstancedMesh(new PlaneGeometry(1, 1), createStratusMaterial(), sheets.length)
    mesh.frustumCulled = false
    return mesh
  }, [sheets])

  const dummy = useMemo(() => new Object3D(), [])
  const elapsed = useRef(0)
  // The burst: which heaps are pushed, which way (unit x, z per heap), and when it started.
  const burst = useMemo(
    () => ({
      indices: new Int32Array(CLOUD_BURST.pushedPuffs).fill(-1),
      directions: new Float32Array(CLOUD_BURST.pushedPuffs * 2),
      startedAt: -Infinity,
      // Scratch for the per-frame nearest-heaps scan.
      nearest: new Int32Array(CLOUD_BURST.pushedPuffs),
      nearestDepth: new Float32Array(CLOUD_BURST.pushedPuffs),
    }),
    [],
  )

  useEffect(
    () => () => {
      for (const mesh of [cumulus, stratus]) {
        mesh.geometry.dispose()
        ;(mesh.material as { dispose: () => void }).dispose()
        mesh.dispose()
      }
      useCloudStore.setState({ inside: false })
    },
    [cumulus, stratus],
  )

  useFrame((_state, delta) => {
    // `?shot=` bookmarks freeze the drift and skip fly-through, so a capture is repeatable.
    const shot = activeShot()
    if (!shot) elapsed.current += delta
    const t = elapsed.current
    const { position } = useFlightStore.getState().state

    // Stratus: drift, wrap, write.
    const stratusX = STRATUS_CONFIG.windX * t
    const stratusZ = STRATUS_CONFIG.windZ * t
    // Plain loops, not `forEach`: no per-frame closures, nothing allocated.
    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i]
      if (!sheet) continue
      dummy.position.set(
        wrapAround(sheet.x + stratusX, position.x, STRATUS_CONFIG.fieldSize),
        sheet.y,
        wrapAround(sheet.z + stratusZ, position.z, STRATUS_CONFIG.fieldSize),
      )
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(sheet.width, sheet.height, 1)
      dummy.updateMatrix()
      stratus.setMatrixAt(i, dummy.matrix)
    }
    stratus.instanceMatrix.needsUpdate = true

    // Cumulus: find the heaps nearest the plane (and whether it's inside one) at their rest
    // positions, so pushing them aside can't flicker the inside test.
    const { fieldSize, windX, windZ } = CUMULUS_CONFIG
    let filled = 0
    for (let i = 0; i < puffs.length; i++) {
      const puff = puffs[i]
      if (!puff) continue
      const x = wrapAround(puff.clusterX + windX * t, position.x, fieldSize) + puff.offsetX
      const z = wrapAround(puff.clusterZ + windZ * t, position.z, fieldSize) + puff.offsetZ
      const depth = heapDepth(position.x - x, position.y - puff.y, position.z - z, puff)
      filled = insertNearest(burst.nearest, burst.nearestDepth, filled, i, depth)
    }
    const inside = !shot && filled > 0 && (burst.nearestDepth[0] ?? Infinity) < 1
    const store = useCloudStore.getState()
    if (inside !== store.inside) {
      // The burst runs on the drift clock, so both stop together for `?shot=`.
      const fresh = inside && t - burst.startedAt >= CLOUD_BURST.cooldown
      if (fresh) {
        burst.startedAt = t
        for (let k = 0; k < CLOUD_BURST.pushedPuffs; k++) {
          const index = k < filled ? (burst.nearest[k] ?? -1) : -1
          burst.indices[k] = index
          const puff = index >= 0 ? puffs[index] : undefined
          if (!puff) continue
          // Away from the plane, level: the heaps part around it.
          const x = wrapAround(puff.clusterX + windX * t, position.x, fieldSize) + puff.offsetX
          const z = wrapAround(puff.clusterZ + windZ * t, position.z, fieldSize) + puff.offsetZ
          const dx = x - position.x
          const dz = z - position.z
          const length = Math.hypot(dx, dz)
          burst.directions[k * 2] = length > 1e-3 ? dx / length : 1
          burst.directions[k * 2 + 1] = length > 1e-3 ? dz / length : 0
        }
      }
      useCloudStore.setState(fresh ? { inside, bursts: store.bursts + 1 } : { inside })
    }

    const push = pushAmount(t - burst.startedAt) * CLOUD_BURST.pushFraction
    for (let i = 0; i < puffs.length; i++) {
      const puff = puffs[i]
      if (!puff) continue
      let x = wrapAround(puff.clusterX + windX * t, position.x, fieldSize) + puff.offsetX
      let z = wrapAround(puff.clusterZ + windZ * t, position.z, fieldSize) + puff.offsetZ
      if (push > 0) {
        for (let k = 0; k < CLOUD_BURST.pushedPuffs; k++) {
          if (burst.indices[k] !== i) continue
          x += (burst.directions[k * 2] ?? 0) * push * puff.radius
          z += (burst.directions[k * 2 + 1] ?? 0) * push * puff.radius
        }
      }
      dummy.position.set(x, puff.y, z)
      dummy.rotation.set(0, puff.yaw, 0)
      dummy.scale.set(puff.radius, puff.height, puff.radius * puff.stretch)
      dummy.updateMatrix()
      cumulus.setMatrixAt(i, dummy.matrix)
    }
    cumulus.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <primitive object={cumulus} />
      <primitive object={stratus} />
    </>
  )
}
