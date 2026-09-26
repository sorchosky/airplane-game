import { Quaternion, Vector3, type BufferGeometry } from 'three'
import { clamp } from '../input/clamp'
import type { ControlInput } from '../input/types'
import { CONTROL_SURFACES, type ControlSurface, type Hinge } from './planeGeometry'

/**
 * Plane animation math: control-surface deflections and the prop. Pure functions over the
 * `ControlInput` and flight state, plus `createArticulation`, which bends a geometry's control
 * surfaces around their hinges on the CPU. Moving the surfaces inside the merged stripe mesh,
 * rather than as separate meshes, keeps the plane at a handful of draw calls.
 */

export interface PlaneRigParams {
  aileronMax: number // radians, deflection at full roll input
  elevatorMax: number // radians, deflection at full pitch input
  rudderMax: number // radians, deflection at `rudderFullTurnRate`
  rudderFullTurnRate: number // rad/s, turn rate that gives full rudder ("slightly": capped low)
  surfaceDampingRate: number // 1/s, exponential damping of surfaces toward their targets
  propRevsPerMeter: number // prop revolutions per meter flown, while the blades are visible
  discSpeedFraction: number // fraction of cruise speed at and above which the blur disc shows
  discHysteresis: number // fraction of cruise speed, keeps the swap from flickering at the edge
}

const degToRad = (degrees: number): number => (degrees * Math.PI) / 180

export const PLANE_RIG_PARAMS: PlaneRigParams = {
  // Past a real 172's travel so the deflection reads from the chase camera on a TV (#71).
  aileronMax: degToRad(26),
  elevatorMax: degToRad(24),
  rudderMax: degToRad(12),
  // About the turn rate at a 45° bank at cruise (g · tan 45° / 45 m/s).
  rudderFullTurnRate: 0.22,
  surfaceDampingRate: 12,
  // 0.15 rev/m is ~6.75 rev/s at cruise: slow enough that two blades at 60 fps never alias into
  // the wagon-wheel effect (that needs < 15 rev/s), fast enough to read as spinning.
  propRevsPerMeter: 0.15,
  // The flight model slows toward ~38 m/s in a sustained full climb, so the blades show in a
  // climb and the disc at cruise and in a dive.
  discSpeedFraction: 0.92,
  discHysteresis: 0.02,
}

export type SurfaceDeflections = Record<ControlSurface, number>

export const NEUTRAL_DEFLECTIONS: SurfaceDeflections = {
  aileronLeft: 0,
  aileronRight: 0,
  elevatorLeft: 0,
  elevatorRight: 0,
  rudder: 0,
}

/** Coordinated-turn rate, rad/s, positive turning right. Same formula as the flight model. */
export function turnRate(bank: number, speed: number, gravity: number): number {
  return (gravity * Math.tan(bank)) / Math.max(speed, 1)
}

/**
 * Where each surface wants to be. Positive = trailing edge up (ailerons, elevator) or toward the
 * right (rudder). Rolling right raises the right aileron and drops the left; climbing raises the
 * elevator; a right turn swings the rudder right. With `active` false the autopilot is flying,
 * so the stick-driven surfaces center. Written into `out` (a fresh object by default).
 */
export function targetDeflections(
  input: ControlInput,
  flight: { bank: number; speed: number },
  gravity: number,
  params: PlaneRigParams = PLANE_RIG_PARAMS,
  out: SurfaceDeflections = { ...NEUTRAL_DEFLECTIONS },
): SurfaceDeflections {
  const roll = input.active ? clamp(input.roll, -1, 1) : 0
  const pitch = input.active ? clamp(input.pitch, -1, 1) : 0
  const turn = turnRate(flight.bank, flight.speed, gravity) / params.rudderFullTurnRate
  const elevator = pitch * params.elevatorMax
  out.aileronRight = roll * params.aileronMax
  out.aileronLeft = -roll * params.aileronMax
  out.elevatorLeft = elevator
  out.elevatorRight = elevator
  out.rudder = clamp(turn, -1, 1) * params.rudderMax
  return out
}

/** Frame-rate-independent step of `current` toward `target`, in place. */
export function dampDeflections(
  current: SurfaceDeflections,
  target: SurfaceDeflections,
  dt: number,
  params: PlaneRigParams = PLANE_RIG_PARAMS,
): SurfaceDeflections {
  const t = 1 - Math.exp(-params.surfaceDampingRate * dt)
  // Written out per surface: a loop over the names stores through computed keys, which V8 boxes
  // and re-looks-up on every write (measured at ~320 B per call), and this runs every frame.
  current.aileronLeft += (target.aileronLeft - current.aileronLeft) * t
  current.aileronRight += (target.aileronRight - current.aileronRight) * t
  current.elevatorLeft += (target.elevatorLeft - current.elevatorLeft) * t
  current.elevatorRight += (target.elevatorRight - current.elevatorRight) * t
  current.rudder += (target.rudder - current.rudder) * t
  return current
}

/** Prop spin, rad/s: proportional to airspeed. */
export function propSpinRate(speed: number, params: PlaneRigParams = PLANE_RIG_PARAMS): number {
  return Math.max(speed, 0) * params.propRevsPerMeter * Math.PI * 2
}

/**
 * Whether to draw the translucent blur disc instead of the blades. Hysteresis around the
 * threshold means a speed hovering there doesn't flicker between the two.
 */
export function showPropDisc(
  speed: number,
  cruiseSpeed: number,
  wasShowing: boolean,
  params: PlaneRigParams = PLANE_RIG_PARAMS,
): boolean {
  const band = wasShowing ? -params.discHysteresis : params.discHysteresis
  return speed >= cruiseSpeed * (params.discSpeedFraction + band)
}

export interface Articulation {
  /** Rotates each control surface's vertices (and normals) to `deflections` from rest. */
  apply: (deflections: SurfaceDeflections) => void
}

/**
 * Bends a geometry's control surfaces, found by its `surface` attribute, about their hinges.
 * Snapshots the rest pose on creation; `apply` always rotates from rest, so it doesn't drift.
 */
export function createArticulation(
  geometry: BufferGeometry,
  hinges: Record<ControlSurface, Hinge>,
): Articulation {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const surface = geometry.getAttribute('surface')
  const restPosition = Float32Array.from(position.array)
  const restNormal = Float32Array.from(normal.array)

  const moving = CONTROL_SURFACES.map(() => [] as number[])
  for (let i = 0; i < surface.count; i++) {
    const id = Math.round(surface.getX(i))
    if (id > 0) moving[id - 1]?.push(i)
  }

  const rotation = new Quaternion()
  const v = new Vector3()
  return {
    apply: (deflections) => {
      // Indexed loops (no `forEach` closure or `for...of` iterator): this runs every frame.
      for (let s = 0; s < CONTROL_SURFACES.length; s++) {
        const name = CONTROL_SURFACES[s]
        const indices = moving[s]
        if (!name || !indices) continue
        const hinge = hinges[name]
        rotation.setFromAxisAngle(hinge.axis, deflections[name])
        for (let k = 0; k < indices.length; k++) {
          const i = indices[k] ?? 0
          v.fromArray(restPosition, i * 3)
            .sub(hinge.origin)
            .applyQuaternion(rotation)
            .add(hinge.origin)
          position.setXYZ(i, v.x, v.y, v.z)
          v.fromArray(restNormal, i * 3).applyQuaternion(rotation)
          normal.setXYZ(i, v.x, v.y, v.z)
        }
      }
      position.needsUpdate = true
      normal.needsUpdate = true
    },
  }
}
