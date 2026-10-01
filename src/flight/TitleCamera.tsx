import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import { useGameStore } from '../app/gameStore'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { expDamp } from './cameraMath'
import { TITLE_FLYBY, createTitleFlybyPose, titleFlyby, titleFlybyTime } from './titleFlyby'

/** 1/s: how fast the camera leans in for the Choose beat and back out again. */
const LEAN_RATE = 3

interface TitleCameraProps {
  /** Hold the loop at its frozen time (`?shot=title`, reduced motion); the lean snaps too. */
  frozen: boolean
}

/**
 * The camera behind the front door (#157): follows the scripted loop's camera pose, and leans in
 * to the Choose framing while the control choice is up. Mounted only in attract, in place of
 * `ChaseCamera`. Reads `gameStore` in `useFrame`, so nothing re-renders at frame rate.
 */
export function TitleCamera({ frozen }: TitleCameraProps) {
  const cameraRef = useRef<ThreePerspectiveCamera>(null)
  const pose = useRef(createTitleFlybyPose())
  const lean = useRef(0)

  useFrame((frameState, delta) => {
    const camera = cameraRef.current
    if (!camera) return
    const target = useGameStore.getState().state === 'select' ? 1 : 0
    lean.current = frozen ? target : expDamp(lean.current, target, LEAN_RATE, delta)
    const flown = titleFlyby(
      titleFlybyTime(frameState.clock.elapsedTime, frozen),
      lean.current,
      pose.current,
    )
    camera.position.copy(flown.cameraPosition)
    camera.lookAt(flown.cameraLookAt)
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
