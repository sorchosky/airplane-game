import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import { Vector3 } from 'three'
import {
  CHASE_CAMERA_PARAMS,
  chaseCameraFov,
  chaseCameraOrientation,
  dampVector3,
  desiredCameraPosition,
  reducedMotionChaseCameraParams,
} from './cameraMath'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { useFlightStore } from './flightStore'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Spring-damped third-person camera. Position and look-at are imperatively updated in `useFrame`
 * (not React state) so this never triggers a re-render; it just reads `flightStore` each frame,
 * matching how `Plane` drives its own transform.
 */
export function ChaseCamera() {
  const cameraRef = useRef<ThreePerspectiveCamera>(null)
  const smoothedPosition = useRef(new Vector3())
  const smoothedLookAt = useRef(new Vector3())
  const initialized = useRef(false)

  // Read once per mount: a live media-query listener isn't worth it for a setting that doesn't
  // change mid-session in practice, and keeps this component free of extra subscriptions.
  const params = useMemo(
    () =>
      prefersReducedMotion()
        ? reducedMotionChaseCameraParams(CHASE_CAMERA_PARAMS)
        : CHASE_CAMERA_PARAMS,
    [],
  )

  useFrame((_frameState, delta) => {
    const camera = cameraRef.current
    if (!camera) return

    const { state } = useFlightStore.getState()
    const desiredPosition = desiredCameraPosition(state.position, state.heading, params)
    const desiredLookAt = state.position

    if (!initialized.current) {
      smoothedPosition.current.copy(desiredPosition)
      smoothedLookAt.current.copy(desiredLookAt)
      initialized.current = true
    } else {
      smoothedPosition.current = dampVector3(
        smoothedPosition.current,
        desiredPosition,
        params.positionDampingRate,
        delta,
      )
      smoothedLookAt.current = dampVector3(
        smoothedLookAt.current,
        desiredLookAt,
        params.lookAtDampingRate,
        delta,
      )
    }

    camera.position.copy(smoothedPosition.current)
    camera.quaternion.copy(
      chaseCameraOrientation(
        smoothedPosition.current,
        smoothedLookAt.current,
        state.bank,
        params.rollFraction,
      ),
    )

    const fov = chaseCameraFov(state.speed, params)
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={params.fovBase}
      // Far plane just past the terrain's view distance. Near is 1 m rather than 0.1 m to keep
      // depth precision reasonable across that 10 km range; the plane is never closer than ~12 m.
      near={1}
      far={TERRAIN_CONFIG.viewDistance * 1.2}
      position={[0, CHASE_CAMERA_PARAMS.offsetUp, CHASE_CAMERA_PARAMS.offsetBack]}
    />
  )
}
