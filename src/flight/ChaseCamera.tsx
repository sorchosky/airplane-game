import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import { Vector3 } from 'three'
import { shotCameraPosition, type ShotBookmark } from '../debug/shots'
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
interface ChaseCameraProps {
  /** `?shot=` bookmark with a camera override: the camera parks at its offset and looks at the plane. */
  shot?: ShotBookmark | null
}

export function ChaseCamera({ shot = null }: ChaseCameraProps) {
  const cameraRef = useRef<ThreePerspectiveCamera>(null)
  const smoothedPosition = useRef(new Vector3())
  const smoothedLookAt = useRef(new Vector3())
  const desiredPosition = useRef(new Vector3())
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
    if (shot?.cameraOffset) {
      camera.position.set(...shotCameraPosition(shot))
      camera.lookAt(state.position)
      return
    }
    // Every vector below is a long-lived scratch written in place: a frame allocates nothing.
    const desired = desiredCameraPosition(
      state.position,
      state.heading,
      params,
      desiredPosition.current,
    )
    const desiredLookAt = state.position

    if (!initialized.current) {
      smoothedPosition.current.copy(desired)
      smoothedLookAt.current.copy(desiredLookAt)
      initialized.current = true
    } else {
      dampVector3(
        smoothedPosition.current,
        desired,
        params.positionDampingRate,
        delta,
        smoothedPosition.current,
      )
      dampVector3(
        smoothedLookAt.current,
        desiredLookAt,
        params.lookAtDampingRate,
        delta,
        smoothedLookAt.current,
      )
    }

    camera.position.copy(smoothedPosition.current)
    chaseCameraOrientation(
      smoothedPosition.current,
      smoothedLookAt.current,
      state.bank,
      params.rollFraction,
      camera.quaternion,
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
