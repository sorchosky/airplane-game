import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import { useFrontDoorLookStore } from '../app/frontDoorLookStore'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { recordTitleCamera } from './flybyHandoff'
import { TITLE_FLYBY, createTitleFlybyPose, titleFlyby, titleFlybyTime } from './titleFlyby'

interface TitleCameraProps {
  /** Hold the loop at its frozen time (`?shot=title`, reduced motion). */
  frozen: boolean
}

/**
 * The camera behind the front door (#157): follows the scripted loop's camera pose, and leans in
 * to the Choose framing as far as the Start timeline has taken it (#159, `frontDoorLookStore`, which
 * already eases it, so a reduced-motion jump is just a store write). Mounted only in attract, in
 * place of `ChaseCamera`. Reads the store in `useFrame`, so nothing re-renders at frame rate.
 */
export function TitleCamera({ frozen }: TitleCameraProps) {
  const cameraRef = useRef<ThreePerspectiveCamera>(null)
  const pose = useRef(createTitleFlybyPose())

  useFrame((frameState) => {
    const camera = cameraRef.current
    if (!camera) return
    const flown = titleFlyby(
      titleFlybyTime(frameState.clock.elapsedTime, frozen),
      useFrontDoorLookStore.getState().lean,
      pose.current,
    )
    camera.position.copy(flown.cameraPosition)
    camera.lookAt(flown.cameraLookAt)
    // Where the chase camera glides in from when flight takes over (#161).
    recordTitleCamera(flown, camera.fov)
  })

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={TITLE_FLYBY.fov}
      near={1}
      far={TERRAIN_CONFIG.viewDistance * 1.2}
    />
  )
}
