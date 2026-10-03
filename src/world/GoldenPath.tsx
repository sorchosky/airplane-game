import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from 'three'
import { playWhoosh } from '../audio/audioEngine'
import { useFlightStore } from '../flight/flightStore'
import { color, space, type } from '../styles/tokens'
import { useCloudStore } from './cloudStore'
import { useGoldenPathStore } from './goldenPathStore'
import {
  GOLDEN_PATH,
  advanceProgress,
  applyRingSpeedGain,
  createGoldenPathRoute,
  initialProgress,
  stationsPassed,
  type LoopProgress,
  type PathPoint,
} from './goldenPath'

const PUFFS_PER_RING = 8
const dummy = new Object3D()
const forward = new Vector3(0, 0, 1)
const direction = new Vector3()
const lit = new Color(color.textPrimary)
const passedColor = new Color(color.controlInactive)

/** Wind rings and the cloud gate along the loop, completing a lap at the return notch. */
export function GoldenPath({ paused }: { paused: boolean }) {
  const ringsRef = useRef<InstancedMesh>(null)
  const puffsRef = useRef<InstancedMesh>(null)
  const route = useMemo(() => createGoldenPathRoute(), [])
  const ringCount = route.rings.length
  const puffStarted = useRef(new Array<number>(ringCount).fill(-1))
  const cloudBurst = useRef(false)
  const previous = useRef<PathPoint | null>(null)
  const shownProgress = useRef<LoopProgress | null>(null)

  const ringGeometry = useMemo(() => new TorusGeometry(GOLDEN_PATH.ringRadius, 0.7, 8, 48), [])
  const puffGeometry = useMemo(() => new IcosahedronGeometry(1, 0), [])
  const ringMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: color.textPrimary,
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

  useEffect(() => {
    useGoldenPathStore.setState({ progress: initialProgress(route.gates.length), reveal: 0 })
    const rings = ringsRef.current
    if (!rings) return
    route.rings.forEach((gateIndex, i) => {
      const gate = route.gates[gateIndex]
      if (!gate) return
      direction.set(gate.normal.x, 0, gate.normal.z)
      dummy.position.set(gate.position.x, gate.position.y, gate.position.z)
      dummy.quaternion.setFromUnitVectors(forward, direction)
      dummy.updateMatrix()
      rings.setMatrixAt(i, dummy.matrix)
    })
    rings.instanceMatrix.needsUpdate = true
  }, [route])

  useEffect(
    () => () => {
      ringGeometry.dispose()
      puffGeometry.dispose()
      ringMaterial.dispose()
      puffMaterial.dispose()
      useGoldenPathStore.setState({ progress: initialProgress(0), reveal: 0 })
    },
    [puffGeometry, puffMaterial, ringGeometry, ringMaterial],
  )

  useFrame(({ clock, camera }) => {
    if (paused) {
      // Resume from where the plane is, not from where it was paused or parked.
      previous.current = null
      return
    }
    const { state, params } = useFlightStore.getState()
    const now = clock.elapsedTime
    const current = state.position
    const from = previous.current ?? { x: current.x, y: current.y, z: current.z }

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
    const { progress } = useGoldenPathStore.getState()
    if (rings && progress !== shownProgress.current) {
      shownProgress.current = progress
      route.rings.forEach((gateIndex, i) =>
        rings.setColorAt(i, progress.passed[gateIndex] ? passedColor : lit),
      )
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true
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
              gate.position.x - gate.normal.z * across,
              gate.position.y + Math.sin(angle) * spread,
              gate.position.z + gate.normal.x * across,
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

    previous.current = { x: current.x, y: current.y, z: current.z }
  })

  return (
    <>
      <instancedMesh ref={ringsRef} args={[ringGeometry, ringMaterial, ringCount]} />
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
