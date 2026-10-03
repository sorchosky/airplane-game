import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import { Quaternion, Vector3 } from 'three'
import { shotCameraPosition, shotLookTarget, type ShotBookmark } from '../debug/shots'
import {
  CAMERA_HANDOFF_S,
  CHASE_CAMERA_PARAMS,
  chaseCameraFov,
  chaseCameraOrientation,
  dampVector3,
  desiredCameraPosition,
  framedLookAt,
  handoffBlendWeight,
  handoffCameraPose,
  reducedMotionChaseCameraParams,
} from './cameraMath'
import { flybyHandoff } from './flybyHandoff'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { onWorldWrap, useFlightStore } from './flightStore'
import { cameraShake, speedVfxIntensity } from './flightVfxMath'

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
  /**
   * A bookmark with a camera override (`?shot=`, or the title bookmark in attract): the camera
   * parks at its offset and looks at the plane, or at `lookOffset` from it.
   */
  shot?: ShotBookmark | null
}

export function ChaseCamera({ shot = null }: ChaseCameraProps) {
  const cameraRef = useRef<ThreePerspectiveCamera>(null)
  const smoothedPosition = useRef(new Vector3())
  const smoothedLookAt = useRef(new Vector3())
  const desiredPosition = useRef(new Vector3())
  const aim = useRef(new Vector3())
  const initialized = useRef(false)
  // The glide in from the title camera (#161): seconds into it, or null when there is none.
  const glide = useRef<number | null>(null)
  const chaseOrientation = useRef(new Quaternion())
  const reducedMotion = useMemo(prefersReducedMotion, [])

  // Read once per mount: a live media-query listener isn't worth it for a setting that doesn't
  // change mid-session in practice, and keeps this component free of extra subscriptions.
  const params = useMemo(
    () =>
      prefersReducedMotion()
        ? reducedMotionChaseCameraParams(CHASE_CAMERA_PARAMS)
        : CHASE_CAMERA_PARAMS,
    [],
  )

  // The plane wrapped round the world (#177): the springs and the camera move with it, so the
  // chase carries on across the seam with no catch-up.
  useEffect(
    () =>
      onWorldWrap((shift) => {
        smoothedPosition.current.x += shift.x
        smoothedPosition.current.z += shift.z
        smoothedLookAt.current.x += shift.x
        smoothedLookAt.current.z += shift.z
        const camera = cameraRef.current
        if (camera) {
          camera.position.x += shift.x
          camera.position.z += shift.z
        }
      }),
    [],
  )

  useFrame((frameState, delta) => {
    const camera = cameraRef.current
    if (!camera) return

    const { state } = useFlightStore.getState()
    if (shot?.cameraOffset) {
      camera.position.set(...shotCameraPosition(shot))
      camera.lookAt(...shotLookTarget(shot))
      // Flying on from a parked camera (the attract world) snaps to the chase position.
      initialized.current = false
      return
    }
    // Every vector below is a long-lived scratch written in place: a frame allocates nothing.
    const desired = desiredCameraPosition(
      state.position,
      state.heading,
      params,
      desiredPosition.current,
      state.yawBank,
    )
    const desiredLookAt = state.position

    if (!initialized.current) {
      smoothedPosition.current.copy(desired)
      smoothedLookAt.current.copy(desiredLookAt)
      initialized.current = true
      // Taking over from the title flyby glides in from its camera; reduced motion cuts (the
      // world is still blurred as it does, and the blur fading out is the crossfade).
      glide.current = flybyHandoff.cameraValid && !reducedMotion ? 0 : null
      flybyHandoff.cameraValid = false
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
    if (params.rollFraction > 0) {
      const intensity = speedVfxIntensity(state.speed, useFlightStore.getState().params.cruiseSpeed)
      const [shakeX, shakeY] = cameraShake(frameState.clock.elapsedTime, intensity)
      camera.position.x += shakeX
      camera.position.y += shakeY
    }
    // Aim above the plane so it sits in the lower-centre third, not dead centre (#71).
    framedLookAt(
      smoothedPosition.current,
      smoothedLookAt.current,
      camera.fov,
      params.screenY,
      aim.current,
    )
    chaseCameraOrientation(
      smoothedPosition.current,
      aim.current,
      state.bank,
      params.rollFraction,
      camera.quaternion,
    )

    let fov = chaseCameraFov(state.speed, params)
    if (glide.current !== null) {
      const weight = handoffBlendWeight(glide.current)
      chaseOrientation.current.copy(camera.quaternion)
      desiredPosition.current.copy(camera.position)
      handoffCameraPose(
        state.position,
        state.heading,
        flybyHandoff.cameraOffset,
        flybyHandoff.cameraLookOffset,
        desiredPosition.current,
        chaseOrientation.current,
        weight,
        camera.position,
        camera.quaternion,
      )
      fov = flybyHandoff.fov + (fov - flybyHandoff.fov) * weight
      glide.current = weight >= 1 ? null : glide.current + Math.min(delta, CAMERA_HANDOFF_S / 10)
    }
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
      // depth precision reasonable across that 10 km range; the plane is never closer than ~11 m.
      near={1}
      far={TERRAIN_CONFIG.viewDistance * 1.2}
      position={[0, CHASE_CAMERA_PARAMS.offsetUp, CHASE_CAMERA_PARAMS.offsetBack]}
    />
  )
}
