import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import {
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three'
import { playWhoosh } from '../audio/audioEngine'
import { useFlightStore } from '../flight/flightStore'
import { color, space, type } from '../styles/tokens'
import { useCloudStore } from './cloudStore'
import {
  GOLDEN_PATH,
  applyRingSpeedGain,
  createGoldenPathRoute,
  segmentHitsSphere,
  type PathPoint,
} from './goldenPath'
import { getLandmarks, insideTrigger } from './landmarks'

interface GoldenPathUiState {
  reveal: number
  setReveal: (time: number) => void
}

const useGoldenPathUi = create<GoldenPathUiState>((set) => ({
  reveal: 0,
  setReveal: (reveal) => set({ reveal }),
}))

const dummy = new Object3D()
const forward = new Vector3(0, 0, 1)
const direction = new Vector3()

/** Wind rings and a denser cloud bank composing the optional first flight. */
export function GoldenPath({ paused }: { paused: boolean }) {
  const ringsRef = useRef<InstancedMesh>(null)
  const puffsRef = useRef<InstancedMesh>(null)
  const start = useMemo(() => useFlightStore.getState().state.position.clone(), [])
  const arch = useMemo(() => getLandmarks().find((landmark) => landmark.kind === 'arch'), [])
  const route = useMemo(() => (arch ? createGoldenPathRoute(start, arch) : null), [arch, start])
  const hit = useRef([false, false, false])
  const puffStarted = useRef([-1, -1, -1])
  const cloudBurst = useRef(false)
  const archPassed = useRef(false)
  const previous = useRef<PathPoint>({ x: start.x, y: start.y, z: start.z })

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
    if (!route || !ringsRef.current) return
    route.rings.forEach((ring, i) => {
      const next = route.rings[i + 1] ?? route.cloud
      direction.set(next.x - ring.x, next.y - ring.y, next.z - ring.z).normalize()
      dummy.position.set(ring.x, ring.y, ring.z)
      dummy.quaternion.copy(new Quaternion().setFromUnitVectors(forward, direction))
      dummy.updateMatrix()
      ringsRef.current?.setMatrixAt(i, dummy.matrix)
    })
    ringsRef.current.instanceMatrix.needsUpdate = true
  }, [route])

  useEffect(
    () => () => {
      ringGeometry.dispose()
      puffGeometry.dispose()
      ringMaterial.dispose()
      puffMaterial.dispose()
      useGoldenPathUi.getState().setReveal(0)
    },
    [puffGeometry, puffMaterial, ringGeometry, ringMaterial],
  )

  useFrame(({ clock, camera }) => {
    if (!route || paused) return
    const { state, params } = useFlightStore.getState()
    const now = clock.elapsedTime
    const current = state.position

    route.rings.forEach((ring, i) => {
      if (
        !hit.current[i] &&
        segmentHitsSphere(previous.current, current, ring, GOLDEN_PATH.ringRadius)
      ) {
        hit.current[i] = true
        puffStarted.current[i] = now
        applyRingSpeedGain(state, params.maxSpeed)
        playWhoosh('ring')
      }
    })

    const cloudDistance = Math.hypot(
      current.x - route.cloud.x,
      current.y - route.cloud.y,
      current.z - route.cloud.z,
    )
    if (!cloudBurst.current && cloudDistance < GOLDEN_PATH.cloudRadius) {
      cloudBurst.current = true
      const cloud = useCloudStore.getState()
      useCloudStore.setState({ inside: true, bursts: cloud.bursts + 1 })
    } else if (
      cloudBurst.current &&
      useCloudStore.getState().inside &&
      cloudDistance > GOLDEN_PATH.cloudRadius
    ) {
      useCloudStore.setState({ inside: false })
    }

    if (
      !archPassed.current &&
      insideTrigger(route.arch.trigger, [current.x, current.y, current.z])
    ) {
      archPassed.current = true
      useGoldenPathUi.getState().setReveal(performance.now())
    }

    const rings = ringsRef.current
    if (rings) {
      route.rings.forEach((_ring, i) =>
        rings.setColorAt(i, new Color(hit.current[i] ? color.controlInactive : color.textPrimary)),
      )
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true
    }

    const puffs = puffsRef.current
    if (puffs) {
      let index = 0
      route.rings.forEach((ring, ringIndex) => {
        const age = now - (puffStarted.current[ringIndex] ?? -1)
        for (let i = 0; i < 8; i += 1) {
          const visible = age >= 0 && age < 1.2
          const angle = (i / 8) * Math.PI * 2
          const spread = visible ? 16 + age * 18 : 0
          dummy.position.set(
            ring.x + Math.cos(angle) * spread,
            ring.y + Math.sin(angle) * spread,
            ring.z,
          )
          dummy.quaternion.copy(camera.quaternion)
          dummy.scale.setScalar(visible ? Math.max(0.01, 3 * (1 - age / 1.2)) : 0)
          dummy.updateMatrix()
          puffs.setMatrixAt(index++, dummy.matrix)
        }
      })
      puffs.instanceMatrix.needsUpdate = true
    }

    previous.current = { x: current.x, y: current.y, z: current.z }
  })

  if (!route) return null
  return (
    <>
      <instancedMesh ref={ringsRef} args={[ringGeometry, ringMaterial, 3]} />
      <instancedMesh ref={puffsRef} args={[puffGeometry, puffMaterial, 24]} frustumCulled={false} />
    </>
  )
}

/** The arch payoff. It is informational only and fades back to unrestricted flight. */
export function GoldenPathTitle() {
  const reveal = useGoldenPathUi((state) => state.reveal)
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
