import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { useInputStore } from '../input/inputStore'
import { surfaceHeightAt } from '../world/heightfield'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { ContactShadow } from './ContactShadow'
import { useFlightStore } from './flightStore'
import { PlaneModel } from './PlaneModel'
import { createTitleFlybyPose, titleFlyby, titleFlybyTime } from './titleFlyby'
import { WingtipVortices } from './WingtipVortices'

interface PlaneProps {
  /** Freezes the simulation while the game is paused. */
  paused: boolean
  /**
   * The title flyby flies the plane (#157): each frame it is placed on the scripted loop at the
   * loop time, and the sim never steps.
   */
  scripted?: boolean
  /** Scripted only: hold the loop at its named frozen time (`?shot=title`, reduced motion). */
  frozen?: boolean
}

/**
 * Steps the flight model each frame and places the plane model at the result. The contact shadow
 * and wingtip vortices live in world space beside it, not under the moving group.
 */
export function Plane({ paused, scripted = false, frozen = false }: PlaneProps) {
  const groupRef = useRef<Group>(null)
  const pose = useRef(createTitleFlybyPose())

  useFrame((frameState, delta) => {
    if (scripted) {
      const { state } = useFlightStore.getState()
      const flown = titleFlyby(
        titleFlybyTime(frameState.clock.elapsedTime, frozen),
        0,
        pose.current,
      )
      state.position.copy(flown.position)
      state.orientation.copy(flown.orientation)
      state.bank = flown.bank
      state.bankRate = flown.bankRate
      state.yawBank = flown.bank
      state.heading = flown.heading
      state.pitchAngle = flown.pitchAngle
      state.speed = flown.speed
      state.floorContact = 0
    } else if (!paused) {
      const input = useInputStore.getState().current
      const { position } = useFlightStore.getState().state
      const groundHeight = surfaceHeightAt(position.x, position.z, TERRAIN_CONFIG)
      useFlightStore.getState().tick(input, delta, groundHeight)
    }

    // Paused freezes the sim: the flight step isn't called, so nothing accumulates. The model
    // still follows the store, so a plane parked by `?shot=` (or reset) is placed on its first frame.
    const group = groupRef.current
    if (!group) return
    const { state } = useFlightStore.getState()
    group.position.copy(state.position)
    group.quaternion.copy(state.orientation)
  })

  return (
    <>
      <group ref={groupRef}>
        <PlaneModel paused={paused} scripted={scripted} />
      </group>
      <ContactShadow />
      <WingtipVortices paused={paused} />
    </>
  )
}
