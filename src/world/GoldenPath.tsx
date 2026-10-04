import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  ConeGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from 'three'
import { playWhoosh } from '../audio/audioEngine'
import { color, space, type } from '../styles/tokens'
import { onWorldWrap, useFlightStore } from '../flight/flightStore'
import { useCloudStore } from './cloudStore'
import { useGoldenPathStore } from './goldenPathStore'
import {
  GOLDEN_PATH,
  advanceProgress,
  applyRingSpeedGain,
  createGoldenPathRoute,
  initialProgress,
  stationsPassed,
  type Gate,
  type PathPoint,
} from './goldenPath'
import { ROUTE } from './route'
import { TERRAIN_CONFIG } from './terrainConfig'
import { imageShift } from './wrap'
import { useCourseSettingsStore } from '../app/courseSettingsStore'
import { ringPointerFrame } from '../ui/ringPointerStore'

const PUFFS_PER_RING = 8
const dummy = new Object3D()
const forward = new Vector3(0, 0, 1)
const direction = new Vector3()
const courseColor = new Color(color.courseRing)
const RING_STRENGTH = [1, 0.7, 0.45] as const
const FADE_SECONDS = 0.4
// The plane's step this frame in the route's period, written in place.
const homeCurrent: PathPoint = { x: 0, y: 0, z: 0 }
const homeFrom: PathPoint = { x: 0, y: 0, z: 0 }

/** Places ring `i` at its gate, moved by (`dx`, `dz`) to the gate's copy nearest the camera. */
function placeRing(rings: InstancedMesh, i: number, gate: Gate, dx: number, dz: number): void {
  direction.set(gate.normal.x, 0, gate.normal.z)
  dummy.position.set(gate.position.x + dx, gate.position.y, gate.position.z + dz)
  dummy.quaternion.setFromUnitVectors(forward, direction)
  dummy.scale.setScalar(1)
  dummy.updateMatrix()
  rings.setMatrixAt(i, dummy.matrix)
}

/**
 * Wind rings and the cloud gate along the loop, completing a lap at the return notch.
 *
 * The world wraps (#177): gates count in the route's own period (the plane is taken to its copy
 * nearest the basin), and each ring is drawn at its copy nearest the camera.
 */
export function GoldenPath({ paused }: { paused: boolean }) {
  const ringsRef = useRef<InstancedMesh>(null)
  const puffsRef = useRef<InstancedMesh>(null)
  const chevronsRef = useRef<InstancedMesh>(null)
  const route = useMemo(() => createGoldenPathRoute(), [])
  const ringCount = route.rings.length
  const puffStarted = useRef(new Array<number>(ringCount).fill(-1))
  const cloudBurst = useRef(false)
  const previous = useRef<PathPoint | null>(null)
  // Per ring, the image shift (x, z) its matrix was last written with.
  const ringShifts = useMemo(() => new Float64Array(ringCount * 2), [ringCount])
  const ringStrengths = useMemo(() => new Float32Array(ringCount), [ringCount])
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const ringGeometry = useMemo(() => new TorusGeometry(GOLDEN_PATH.ringRadius, 1.8, 8, 48), [])
  const chevronGeometry = useMemo(() => {
    const geometry = new ConeGeometry(2.4, 6, 3)
    geometry.rotateX(Math.PI / 2)
    return geometry
  }, [])
  const puffGeometry = useMemo(() => new IcosahedronGeometry(1, 0), [])
  const ringMaterial = useMemo(
    () =>
      new MeshToonMaterial({
        color: color.courseRing,
        emissive: color.courseRing,
        emissiveIntensity: 0.75,
        transparent: true,
        opacity: 0.55,
      }),
    [],
  )
  const puffMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: color.textPrimary,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    [],
  )
  const chevronMaterial = useMemo(
    () => new MeshBasicMaterial({ color: color.courseRing, toneMapped: false }),
    [],
  )

  useEffect(() => {
    useGoldenPathStore.setState({
      progress: initialProgress(route.gates.length),
      reveal: 0,
      visibleRingCount: 0,
    })
    const rings = ringsRef.current
    if (!rings) return
    route.rings.forEach((gateIndex, i) => {
      const gate = route.gates[gateIndex]
      if (gate) placeRing(rings, i, gate, 0, 0)
    })
    ringShifts.fill(0)
    rings.instanceMatrix.needsUpdate = true
  }, [route, ringShifts])

  // The plane wrapped round the world: its last position moves with it, so the next frame's
  // step is the short hop it really flew, not a jump across the world.
  useEffect(
    () =>
      onWorldWrap((shift) => {
        const last = previous.current
        if (last) previous.current = { x: last.x + shift.x, y: last.y, z: last.z + shift.z }
      }),
    [],
  )

  useEffect(
    () => () => {
      ringGeometry.dispose()
      puffGeometry.dispose()
      chevronGeometry.dispose()
      ringMaterial.dispose()
      puffMaterial.dispose()
      chevronMaterial.dispose()
      useGoldenPathStore.setState({ progress: initialProgress(0), reveal: 0, visibleRingCount: 0 })
    },
    [chevronGeometry, chevronMaterial, puffGeometry, puffMaterial, ringGeometry, ringMaterial],
  )

  useFrame(({ clock, camera }, delta) => {
    if (paused) {
      // Resume from where the plane is, not from where it was paused or parked.
      previous.current = null
      return
    }
    const { state, params } = useFlightStore.getState()
    const now = clock.elapsedTime
    const position = state.position
    // The plane's copy in the route's period, round the basin; the last position moves the same.
    const { centerX, centerZ } = TERRAIN_CONFIG.basin
    const period = TERRAIN_CONFIG.worldPeriod
    const homeX = imageShift(position.x, centerX, period)
    const homeZ = imageShift(position.z, centerZ, period)
    const current = homeCurrent
    current.x = position.x + homeX
    current.y = position.y
    current.z = position.z + homeZ
    const last = previous.current
    const from = last ? homeFrom : current
    if (last) {
      homeFrom.x = last.x + homeX
      homeFrom.y = last.y
      homeFrom.z = last.z + homeZ
    }

    const crossed = stationsPassed(route.gates, from, current)
    if (crossed.length > 0) {
      const store = useGoldenPathStore.getState()
      const step = advanceProgress(store.progress, crossed)
      for (const gateIndex of step.newlyPassed) {
        const ring = route.rings.indexOf(gateIndex)
        if (ring < 0) continue
        puffStarted.current[ring] = now
        applyRingSpeedGain(state, params.maxSpeed)
        playWhoosh('ring')
      }
      if (step.lapCompleted) playWhoosh('ring')
      if (step.progress !== store.progress || step.lapCompleted) {
        useGoldenPathStore.setState({
          progress: step.progress,
          reveal: step.lapCompleted ? performance.now() : store.reveal,
        })
      }
    }

    const cloud = route.gates[route.cloud]?.position
    if (cloud) {
      const cloudDistance = Math.hypot(
        current.x - cloud.x,
        current.y - cloud.y,
        current.z - cloud.z,
      )
      if (!cloudBurst.current && cloudDistance < GOLDEN_PATH.cloudRadius) {
        cloudBurst.current = true
        const clouds = useCloudStore.getState()
        useCloudStore.setState({ inside: true, bursts: clouds.bursts + 1 })
      } else if (cloudBurst.current && cloudDistance > GOLDEN_PATH.cloudRadius) {
        // Rearmed on the way out, so the cloud bursts again on the next lap.
        cloudBurst.current = false
        if (useCloudStore.getState().inside) useCloudStore.setState({ inside: false })
      }
    }

    const rings = ringsRef.current
    if (rings) {
      const nearestS = ROUTE.nearest(current.x, current.z).s
      const mode = useCourseSettingsStore.getState().courseRings
      let visible = 0
      let moved = false
      let nextRingIndex = -1
      let nextRingDistance = Number.POSITIVE_INFINITY
      route.rings.forEach((gateIndex, i) => {
        const gate = route.gates[gateIndex]
        if (!gate) return
        const dx = imageShift(gate.position.x, camera.position.x, period)
        const dz = imageShift(gate.position.z, camera.position.z, period)
        const distance = (gate.s - nearestS + ROUTE.length) % ROUTE.length
        if (distance < nextRingDistance) {
          nextRingDistance = distance
          nextRingIndex = i
        }
        let rank = 0
        for (const otherIndex of route.rings) {
          const other = route.gates[otherIndex]!
          if ((other.s - nearestS + ROUTE.length) % ROUTE.length < distance) rank += 1
        }
        const target = rank < 3 ? RING_STRENGTH[rank]! : mode === 'all' ? 0.28 : 0
        const strength = reducedMotion
          ? target
          : ringStrengths[i]! +
            Math.sign(target - ringStrengths[i]!) *
              Math.min(Math.abs(target - ringStrengths[i]!), delta / FADE_SECONDS)
        ringStrengths[i] = strength
        if (strength > 0.01) visible += 1
        if (
          dx === ringShifts[i * 2] &&
          dz === ringShifts[i * 2 + 1] &&
          Math.abs(strength - target) < 0.001
        )
          return
        ringShifts[i * 2] = dx
        ringShifts[i * 2 + 1] = dz
        placeRing(rings, i, gate, dx, dz)
        rings.getMatrixAt(i, dummy.matrix)
        dummy.scale.setScalar(strength)
        dummy.updateMatrix()
        rings.setMatrixAt(i, dummy.matrix)
        rings.setColorAt(i, courseColor)
        moved = true
      })
      const nextGateIndex = nextRingIndex < 0 ? undefined : route.rings[nextRingIndex]
      const nextGate = nextGateIndex === undefined ? undefined : route.gates[nextGateIndex]
      if (nextGate) {
        ringPointerFrame.nextRing.set(
          nextGate.position.x + (ringShifts[nextRingIndex * 2] ?? 0),
          nextGate.position.y,
          nextGate.position.z + (ringShifts[nextRingIndex * 2 + 1] ?? 0),
        )
        ringPointerFrame.viewProjection.multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        )
        ringPointerFrame.ready = true
      }
      if (useGoldenPathStore.getState().visibleRingCount !== visible) {
        useGoldenPathStore.setState({ visibleRingCount: visible })
      }
      if (moved) {
        rings.instanceMatrix.needsUpdate = true
        if (rings.instanceColor) rings.instanceColor.needsUpdate = true
        rings.computeBoundingSphere()
      }

      const chevrons = chevronsRef.current
      if (chevrons) {
        let index = 0
        route.rings.forEach((gateIndex, ringIndex) => {
          const gate = route.gates[gateIndex]!
          for (let chevron = 0; chevron < 3; chevron += 1) {
            dummy.position.set(
              gate.position.x + (ringShifts[ringIndex * 2] ?? 0),
              gate.position.y + (chevron - 1) * 7,
              gate.position.z + (ringShifts[ringIndex * 2 + 1] ?? 0),
            )
            dummy.quaternion.setFromUnitVectors(
              forward,
              direction.set(gate.normal.x, 0, gate.normal.z),
            )
            const pulse =
              reducedMotion || window.location.search.includes('shot=')
                ? 1
                : 0.8 + 0.2 * Math.sin((now / 1.2) * Math.PI * 2 + chevron * 1.3)
            dummy.scale.setScalar(ringStrengths[ringIndex]! * pulse)
            dummy.updateMatrix()
            chevrons.setMatrixAt(index++, dummy.matrix)
          }
        })
        chevrons.instanceMatrix.needsUpdate = true
      }
    }
    const puffs = puffsRef.current
    if (puffs) {
      let index = 0
      route.rings.forEach((gateIndex, ringIndex) => {
        const gate = route.gates[gateIndex]
        const age = now - (puffStarted.current[ringIndex] ?? -1)
        const visible = age >= 0 && age < 1.2
        for (let i = 0; i < PUFFS_PER_RING; i += 1) {
          if (gate && visible) {
            // Burst outward in the ring's own plane.
            const angle = (i / PUFFS_PER_RING) * Math.PI * 2
            const spread = 16 + age * 18
            const across = Math.cos(angle) * spread
            dummy.position.set(
              gate.position.x - gate.normal.z * across + (ringShifts[ringIndex * 2] ?? 0),
              gate.position.y + Math.sin(angle) * spread,
              gate.position.z + gate.normal.x * across + (ringShifts[ringIndex * 2 + 1] ?? 0),
            )
            dummy.quaternion.copy(camera.quaternion)
            dummy.scale.setScalar(Math.max(0.01, 3 * (1 - age / 1.2)))
          } else {
            dummy.scale.setScalar(0)
          }
          dummy.updateMatrix()
          puffs.setMatrixAt(index++, dummy.matrix)
        }
      })
      puffs.instanceMatrix.needsUpdate = true
    }

    previous.current = { x: position.x, y: position.y, z: position.z }
  })

  return (
    <>
      <instancedMesh ref={ringsRef} args={[ringGeometry, ringMaterial, ringCount]} />
      <instancedMesh
        ref={chevronsRef}
        args={[chevronGeometry, chevronMaterial, ringCount * 3]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={puffsRef}
        args={[puffGeometry, puffMaterial, ringCount * PUFFS_PER_RING]}
        frustumCulled={false}
      />
    </>
  )
}

/** The lap payoff. It is informational only and fades back to unrestricted flight. */
export function GoldenPathTitle() {
  const reveal = useGoldenPathStore((state) => state.reveal)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reveal) return
    const element = ref.current
    if (!element) return
    element.animate(
      [{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
      { duration: GOLDEN_PATH.titleDuration * 1000, fill: 'forwards', easing: 'ease-in-out' },
    )
  }, [reveal])

  return (
    <div
      ref={ref}
      data-testid="golden-path-title"
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.md,
        color: color.textPrimary,
        opacity: 0,
        pointerEvents: 'none',
        textShadow: `0 0 ${space.md} ${color.glow}`,
      }}
    >
      <strong
        style={{
          fontFamily: type.fontDisplay,
          fontSize: type.tvHero,
          fontWeight: type.weightHero,
          letterSpacing: type.trackingHero,
          textTransform: 'uppercase',
        }}
      >
        Driftwing
      </strong>
      <span style={{ fontFamily: type.fontBody, fontSize: type.tvBody }}>Fly anywhere.</span>
    </div>
  )
}
