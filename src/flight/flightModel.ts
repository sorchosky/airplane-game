import { Euler, Quaternion, Vector3 } from 'three'
import { clamp, clampAxis } from '../input/clamp'
import type { ControlInput } from '../input/types'

export interface FlightState {
  position: Vector3
  orientation: Quaternion
  bank: number // current bank (roll) angle, radians, positive = banking right
  pitchAngle: number // current pitch angle, radians, positive = nose up
  heading: number // yaw angle, radians, around world +Y
  speed: number // current airspeed, m/s
  // Angular velocities driving the bank/pitch springs below. Not part of the ticket's headline
  // list of fields, but a real critically damped spring needs a derivative to integrate; the
  // camera, HUD and audio can ignore these.
  bankRate: number // rad/s
  pitchRate: number // rad/s
}

export interface FlightParams {
  cruiseSpeed: number // m/s, target airspeed in level, unpitched flight (~100 mph, per docs/decisions.md)
  minSpeed: number // m/s, floor speed can't drop below even in a sustained climb
  maxSpeed: number // m/s, ceiling speed can't exceed even in a sustained dive
  speedPitchSensitivity: number // m/s of target-speed change per full radian of pitch (dive = faster, climb = slower)
  speedResponseTime: number // seconds, time constant for speed easing toward its pitch-derived target
  maxBankAngle: number // radians, target bank angle at full roll input (~50°)
  maxPitchAngle: number // radians, target pitch angle at full pitch input (~25°)
  bankSmoothTime: number // seconds, critically-damped spring time constant for bank chasing its target
  pitchSmoothTime: number // seconds, critically-damped spring time constant for pitch chasing its target
  turnGravity: number // m/s^2, "g" in the coordinated-turn formula yawRate = g * tan(bank) / speed
  ceiling: number // m, hard altitude ceiling (~600 m)
  ceilingSoftening: number // m, band below the ceiling over which climb rate eases to zero
  floorClearance: number // m, height above ground where the soft floor starts pitching the nose up
  floorPitchBias: number // radians, pitch-up added to the target at full floor depth (at the ground)
  floorMinAltitude: number // m, hard minimum height above ground; the plane never goes lower
}

const degToRad = (degrees: number): number => (degrees * Math.PI) / 180

export const DEFAULT_FLIGHT_PARAMS: FlightParams = {
  cruiseSpeed: 45,
  minSpeed: 32,
  maxSpeed: 60,
  speedPitchSensitivity: 15,
  speedResponseTime: 1.5,
  maxBankAngle: degToRad(50),
  maxPitchAngle: degToRad(25),
  bankSmoothTime: 0.35,
  pitchSmoothTime: 0.45,
  turnGravity: 9.81,
  ceiling: 600,
  ceilingSoftening: 120,
  floorClearance: 20,
  // Twice the max pitch, so even a full dive becomes a full climb by the time the plane reaches
  // the ground: diving into a hill pulls up by itself.
  floorPitchBias: degToRad(50),
  floorMinAltitude: 2,
}

/** 60 Hz simulation rate. `step` subdivides whatever `dt` it's given into chunks of this size. */
export const FIXED_DT = 1 / 60

export function createInitialFlightState(
  params: FlightParams = DEFAULT_FLIGHT_PARAMS,
  position: Vector3 = new Vector3(0, 0, 0),
): FlightState {
  return {
    position: position.clone(),
    orientation: new Quaternion(),
    bank: 0,
    pitchAngle: 0,
    heading: 0,
    speed: params.cruiseSpeed,
    bankRate: 0,
    pitchRate: 0,
  }
}

interface SpringResult {
  value: number
  velocity: number
}

/**
 * Critically damped spring-damper (the closed-form approximation behind Unity's SmoothDamp /
 * Game Programming Gems 4's "critically damped ease"). Unlike a raw semi-implicit Euler spring
 * it never overshoots the target and stays stable at any smoothTime/dt combination, which matters
 * here since `step` may be called with a large `dt` in tests. Writes into `out` (no allocation).
 */
function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
  out: SpringResult,
): SpringResult {
  const omega = 2 / Math.max(0.0001, smoothTime)
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (velocity + omega * change) * dt
  let nextVelocity = (velocity - omega * temp) * exp
  let nextValue = target + (change + temp) * exp

  const approachingFromBelow = target - current > 0
  if (approachingFromBelow === nextValue > target) {
    nextValue = target
    nextVelocity = 0
  }

  out.value = nextValue
  out.velocity = nextVelocity
  return out
}

// Scratch for the two springs and the orientation. `integrate` reads everything it needs from
// `state` before writing `out`, so `out` may be `state` itself (the store steps in place).
const bankSpring: SpringResult = { value: 0, velocity: 0 }
const pitchSpring: SpringResult = { value: 0, velocity: 0 }
const scratchEuler = new Euler()

/** One fixed-size integration step into `out`. `dt` should be <= FIXED_DT; `step` enforces that. */
function integrate(
  state: FlightState,
  input: ControlInput,
  dt: number,
  params: FlightParams,
  groundHeight: number,
  out: FlightState,
): FlightState {
  const roll = clampAxis(input.roll)
  const pitchInput = clampAxis(input.pitch)
  const { x: px, y: py, z: pz } = state.position

  // Autopilot: when input isn't active, targets go to level flight. Same integration path either
  // way, no separate autopilot code.
  const targetBank = input.active ? roll * params.maxBankAngle : 0
  const pilotPitch = input.active ? pitchInput * params.maxPitchAngle : 0

  // Soft floor: inside `floorClearance` of the ground, bias the pitch target upward, ramping from
  // nothing at the top of the band to `floorPitchBias` at the ground. Goes through the same pitch
  // spring as the pilot's input, so the pull-up eases in rather than snapping.
  const floorDepth = clamp(
    (groundHeight + params.floorClearance - py) / params.floorClearance,
    0,
    1,
  )
  const targetPitch = Math.min(
    pilotPitch + floorDepth * params.floorPitchBias,
    params.maxPitchAngle,
  )

  smoothDamp(state.bank, targetBank, state.bankRate, params.bankSmoothTime, dt, bankSpring)
  smoothDamp(
    state.pitchAngle,
    targetPitch,
    state.pitchRate,
    params.pitchSmoothTime,
    dt,
    pitchSpring,
  )
  const bank = bankSpring.value
  const pitchAngle = pitchSpring.value

  // Coordinated turn: bank produces a yaw rate, there's no direct yaw input. In this Y-up,
  // forward -Z, right-handed frame, a positive (rightward) rotation about +Y actually swings the
  // nose toward -X (left) -- see the forward-vector math below -- so turning right needs heading
  // to *decrease*, hence the minus sign.
  const yawRate = -(params.turnGravity * Math.tan(bank)) / state.speed
  const heading = state.heading + yawRate * dt

  // Speed: constant cruise, nudged by pitch (dive = faster, climb = slower), clamped, and eased
  // toward its target so pitch changes feel like drag/gravity rather than a throttle switch.
  const targetSpeed = clamp(
    params.cruiseSpeed - params.speedPitchSensitivity * Math.sin(pitchAngle),
    params.minSpeed,
    params.maxSpeed,
  )
  const speedLerp = 1 - Math.exp(-dt / params.speedResponseTime)
  const speed = state.speed + (targetSpeed - state.speed) * speedLerp

  const horizontalSpeed = Math.cos(pitchAngle) * speed
  // forward vector = Ry(heading) * (0, 0, -1) = (-sin(heading), 0, -cos(heading))
  const forwardX = -Math.sin(heading) * horizontalSpeed
  const forwardZ = -Math.cos(heading) * horizontalSpeed
  const climbRate = Math.sin(pitchAngle) * speed

  // Soft ceiling: ease climb rate to zero over the last `ceilingSoftening` metres below it. The
  // hard clamp on position.y is just a safety net against overshoot from a large dt.
  const roomToCeiling = params.ceiling - py
  const climbSoftening = clamp(roomToCeiling / params.ceilingSoftening, 0, 1)
  const effectiveClimbRate = climbRate > 0 ? climbRate * climbSoftening : climbRate

  let y = Math.min(py + effectiveClimbRate * dt, params.ceiling)
  // The ground wins over the ceiling: never below `floorMinAltitude`, even on a slope rising
  // faster than the pull-up.
  y = Math.max(y, groundHeight + params.floorMinAltitude)
  out.position.set(px + forwardX * dt, y, pz + forwardZ * dt)

  // Roll is applied about the plane's own forward axis (0, 0, -1), which is a rotation of -bank
  // about world +Z; composed with pitch about local X and yaw about world Y via Three's 'YXZ'
  // Euler order (Z applied first, then X, then Y -- i.e. roll, then pitch, then yaw).
  out.orientation.setFromEuler(scratchEuler.set(pitchAngle, heading, -bank, 'YXZ'))

  out.bank = bank
  out.pitchAngle = pitchAngle
  out.heading = heading
  out.speed = speed
  out.bankRate = bankSpring.velocity
  out.pitchRate = pitchSpring.velocity
  return out
}

/**
 * Advances the flight model by `dt` seconds. `groundHeight` is the terrain height (m) under the
 * plane, sampled once per call by the caller; omit it for open sky with no floor. Internally
 * subdivides `dt` into fixed 60 Hz chunks (with a shorter final chunk for any remainder) so the
 * simulation is numerically stable and gives the same result regardless of how the caller's
 * frame rate happens to chop up real time.
 *
 * Writes the result into `out` and returns it. `out` may be `state` itself (the store steps in
 * place, so a frame allocates nothing); without `out` a fresh state is returned and `state` is
 * left untouched.
 */
export function step(
  state: FlightState,
  input: ControlInput,
  dt: number,
  params: FlightParams,
  groundHeight = Number.NEGATIVE_INFINITY,
  out: FlightState = createInitialFlightState(params),
): FlightState {
  let current = state
  let remaining = dt
  while (remaining > 1e-9) {
    const h = Math.min(FIXED_DT, remaining)
    integrate(current, input, h, params, groundHeight, out)
    current = out
    remaining -= h
  }
  if (current !== out) copyFlightState(state, out)
  return out
}

/** Copies every field of `from` into `to` (no allocation). */
export function copyFlightState(from: FlightState, to: FlightState): FlightState {
  to.position.copy(from.position)
  to.orientation.copy(from.orientation)
  to.bank = from.bank
  to.pitchAngle = from.pitchAngle
  to.heading = from.heading
  to.speed = from.speed
  to.bankRate = from.bankRate
  to.pitchRate = from.pitchRate
  return to
}
