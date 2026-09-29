import type { FlightState } from '../flight/flightModel'
import type { Landmark } from './landmarks'

export const GOLDEN_PATH = {
  ringRadius: 15,
  ringSpeedGain: 2.5,
  ringDistances: [180, 360, 560],
  cloudDistance: 1050,
  cloudRadius: 150,
  titleDuration: 5,
} as const

export interface PathPoint {
  x: number
  y: number
  z: number
}

export interface GoldenPathRoute {
  rings: readonly PathPoint[]
  cloud: PathPoint
  arch: Landmark
}

/**
 * Builds the optional first-flight route. Its opening stays nearly straight ahead, then bends
 * gently toward the arch. Nothing in this module steers or relocates the aircraft.
 */
export function createGoldenPathRoute(start: PathPoint, arch: Landmark): GoldenPathRoute {
  const target = { x: arch.trigger.center[0], y: arch.trigger.center[1], z: arch.trigger.center[2] }
  const distance = Math.hypot(target.x - start.x, target.z - start.z)
  const pointAt = (travel: number): PathPoint => {
    const t = Math.min(0.72, travel / Math.max(distance, 1))
    // Ease into the turn so all three rings are visible as one gentle line from spawn.
    const turn = t * t * (3 - 2 * t)
    return {
      x: start.x + (target.x - start.x) * turn,
      y: start.y + (target.y - start.y) * t * 0.45,
      z: start.z - travel * (1 - turn) + (target.z - start.z) * turn,
    }
  }
  return {
    rings: GOLDEN_PATH.ringDistances.map(pointAt),
    cloud: pointAt(Math.min(GOLDEN_PATH.cloudDistance, distance * 0.62)),
    arch,
  }
}

/** Swept sphere test, so a fast frame cannot skip a ring. */
export function segmentHitsSphere(
  from: PathPoint,
  to: PathPoint,
  center: PathPoint,
  radius: number,
): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const lengthSquared = dx * dx + dy * dy + dz * dz
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((center.x - from.x) * dx + (center.y - from.y) * dy + (center.z - from.z) * dz) /
              lengthSquared,
          ),
        )
  return (
    Math.hypot(
      from.x + dx * t - center.x,
      from.y + dy * t - center.y,
      from.z + dz * t - center.z,
    ) <= radius
  )
}

export function applyRingSpeedGain(state: Pick<FlightState, 'speed'>, maxSpeed: number): number {
  state.speed = Math.min(maxSpeed, state.speed + GOLDEN_PATH.ringSpeedGain)
  return state.speed
}
