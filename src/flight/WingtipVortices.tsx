import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  MeshBasicMaterial,
  Vector3,
  type Mesh,
} from 'three'
import { color } from '../styles/tokens'
import { useFlightStore } from './flightStore'
import {
  VORTEX_PARAMS,
  buildRibbonIndex,
  clearVortexTrail,
  createVortexTrail,
  recordVortex,
  ribbonPoints,
  vortexEmitting,
  wingtipLocal,
  writeRibbon,
} from './vortex'

const TIPS = [wingtipLocal(-1), wingtipLocal(1)] as const
/** m the plane may move in one frame before it counts as a teleport (reset, respawn, `?shot=`). */
const TELEPORT_DISTANCE = 50

interface WingtipVorticesProps {
  /** Freezes the trails with the simulation. */
  paused: boolean
}

/**
 * Vapour ribbons off both wingtips in hard turns and fast dives (`vortex.ts`). Both ribbons live
 * in one world-space geometry rewritten on the CPU each frame (~200 vertices), so the effect is a
 * single draw call; hidden, and free, when neither tip has anything alive.
 */
export function WingtipVortices({ paused }: WingtipVorticesProps) {
  const meshRef = useRef<Mesh>(null)
  const { geometry, material, positions, colors, trails } = useMemo(() => {
    const trails = [createVortexTrail(), createVortexTrail()] as const
    const points = ribbonPoints(trails[0].capacity)
    const vertices = trails.length * points * 2
    const positions = new Float32Array(vertices * 3)
    // RGB stays white (the material carries the token colour); only alpha changes per frame.
    const colors = new Float32Array(vertices * 4).fill(1)
    for (let i = 3; i < colors.length; i += 4) colors[i] = 0
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage))
    geometry.setAttribute('color', new BufferAttribute(colors, 4).setUsage(DynamicDrawUsage))
    geometry.setIndex(new BufferAttribute(buildRibbonIndex(trails.length, points), 1))
    const material = new MeshBasicMaterial({
      color: color.vapor,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      // Double-sided transparent materials otherwise draw twice (back faces, then front).
      forceSinglePass: true,
    })
    return { geometry, material, positions, colors, trails }
  }, [])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  const sim = useRef({ time: 0, lastOn: -Infinity, last: new Vector3(), started: false })
  const tip = useRef(new Vector3())

  useFrame(({ camera }, delta) => {
    const mesh = meshRef.current
    if (!mesh || paused) return
    const { state } = useFlightStore.getState()
    const clock = sim.current
    clock.time += delta
    if (!clock.started || clock.last.distanceToSquared(state.position) > TELEPORT_DISTANCE ** 2) {
      for (const trail of trails) clearVortexTrail(trail)
      clock.lastOn = -Infinity
      clock.started = true
    }
    clock.last.copy(state.position)

    const emitting = vortexEmitting(state.bank, state.speed)
    if (emitting) clock.lastOn = clock.time
    mesh.visible = clock.time - clock.lastOn < VORTEX_PARAMS.life
    if (!mesh.visible) {
      // Nothing alive: drop the old samples so the next burst starts from the wing.
      for (const trail of trails) if (trail.count > 0) clearVortexTrail(trail)
      return
    }

    const points = ribbonPoints(trails[0].capacity)
    for (let side = 0; side < trails.length; side++) {
      const trail = trails[side]
      const local = TIPS[side]
      if (!trail || !local) continue
      const p = tip.current
        .set(local[0], local[1], local[2])
        .applyQuaternion(state.orientation)
        .add(state.position)
      recordVortex(trail, p.x, p.y, p.z, clock.time, emitting)
      writeRibbon(
        trail,
        p.x,
        p.y,
        p.z,
        emitting,
        clock.time,
        camera.position.x,
        camera.position.y,
        camera.position.z,
        positions,
        colors,
        side * points * 2,
      )
    }
    const position = geometry.getAttribute('position')
    const vertexColor = geometry.getAttribute('color')
    position.needsUpdate = true
    vertexColor.needsUpdate = true
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      visible={false}
      // World-space and rewritten every frame: bounds would be stale, and it trails the plane
      // the camera is looking at anyway.
      frustumCulled={false}
    />
  )
}
