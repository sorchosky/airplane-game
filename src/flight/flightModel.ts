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
  // The bank the turn rate follows: the real bank, lagged by `yawLagTime`, so the nose swings a
  // beat after the wings (#68).
  yawBank: number // radians
  // How deep the plane is in the soft floor band, 0 (clear) .. 1 (at the ground). Drives the
  // pull-up and, through `flightStore`'s floor-contact event, the low-pass VFX and audio.
  floorContact: number
  // Arms-back boost (#93). `boosting` is on for one burst of at most `boostDuration`; after it the
  // boost is out for `boostCooldown`, and `boostSpent` holds it out until the request is released,
  // so holding the sweep can't chain bursts.
  boosting: boolean
  boostTime: number // s into the current burst
  boostCooldown: number // s until the boost can fire again
  boostSpent: boolean // the request that fired the last burst is still held
}

export interface FlightParams {
  cruiseSpeed: number // m/s, target airspeed in level, unpitched flight (~100 mph, per docs/decisions.md)
  minSpeed: number // m/s, floor speed can't drop below even in a sustained climb
  maxSpeed: number // m/s, ceiling speed can't exceed even in a sustained dive
  energyGain: number // m/s^2, acceleration along the flight path per unit sin(pitch): dives gain speed, climbs spend it
  speedDecayTime: number // seconds, time constant of speed relaxing back to cruise (drag and throttle together)
  yawLagTime: number // seconds, lag between the bank and the bank the turn rate follows
  maxBankAngle: number // radians, target bank angle at full roll input (~50°)
  maxPitchAngle: number // radians, target pitch angle at full pitch input (~25°)
  bankSmoothTime: number // seconds, critically-damped spring time constant for bank chasing its target
  pitchSmoothTime: number // seconds, critically-damped spring time constant for pitch chasing its target
  maxBankRate: number // rad/s, fastest the bank may change: the plane's weight, so the spring can be quick
  maxPitchRate: number // rad/s, fastest the pitch may change
  turnGravity: number // m/s^2, "g" in the coordinated-turn formula yawRate = g * tan(bank) / speed
  ceiling: number // m, hard altitude ceiling (~600 m)
  ceilingSoftening: number // m, band below the ceiling over which climb rate eases to zero
  floorClearance: number // m, height above ground where the soft floor starts pitching the nose up
  floorPitchBias: number // radians, pitch-up added to the target at full floor depth (at the ground)
  floorMinAltitude: number // m, hard minimum height above ground; the plane never goes lower
  boostAcceleration: number // m/s^2, forward push while boosting level or diving; fades to 0 at full climb
  boostDuration: number // s, longest one burst lasts, however long the request is held
  boostCooldown: number // s, after a burst ends, before another can start
}

const degToRad = (degrees: number): number => (degrees * Math.PI) / 180

/**
 * The feel constants (#68): energy, weight and the floor. Kept together so tuning happens in one
 * place; `flightModel.test.ts` pins what each one does.
 */
export const FLIGHT_FEEL = {
  /**
   * Stronger than real gravity along the path (9.81) so a dive visibly buys speed: a sustained
   * full dive settles near 64 m/s, a sustained full climb would fall to 26 but `minSpeed` holds it
   * at 32.
   */
  energyGain: 18,
  /** Level flight sheds a dive's extra speed with this time constant: 80 % gone in about 4 s. */
  speedDecayTime: 2.5,
  /** Room above the steady full-dive speed, so a dive into the floor pull-up still has headroom. */
  maxSpeed: 68,
  /** A beat of weight: the nose follows the wings by 0.15 s. */
  yawLagTime: 0.15,
  /**
   * Floor contact starts this deep into the soft-floor band (0..1), a metre into a 20 m band, so
   * grazing the top of it doesn't count. It ends back above `floorContactExit`, so hovering at
   * the edge doesn't chatter.
   */
  floorContactEnter: 0.05,
  floorContactExit: 0.02,
  /**
   * The arms-back boost's push (#93), in level flight or a dive. It fades as the nose rises and is
   * gone at full climb, so a boost into a climb bleeds speed exactly as the energy model says. From
   * cruise in level flight it settles toward cruise + 7 · speedDecayTime = 62.5 m/s and reaches
   * about 57 in one full burst: a readable surge, not a second throttle.
   */
  boostAcceleration: 7,
  /** One burst: long enough to feel on a straight, short enough that it can't replace the dive. */
  boostDuration: 3,
  /** Rest between bursts, counted from the end of the last one. */
  boostCooldown: 4,
} as const

export const DEFAULT_FLIGHT_PARAMS: FlightParams = {
  cruiseSpeed: 45,
  minSpeed: 32,
  maxSpeed: FLIGHT_FEEL.maxSpeed,
  energyGain: FLIGHT_FEEL.energyGain,
  speedDecayTime: FLIGHT_FEEL.speedDecayTime,
  yawLagTime: FLIGHT_FEEL.yawLagTime,
  maxBankAngle: degToRad(50),
  maxPitchAngle: degToRad(25),
  // Quick springs with a rate cap (#66): a small tilt shows almost at once, a big one builds at the
  // capped rate, so the weight comes from the cap rather than from lag. See docs/decisions.md.
  bankSmoothTime: 0.2,
  pitchSmoothTime: 0.25,
  maxBankRate: degToRad(120),
  maxPitchRate: degToRad(60),
  turnGravity: 9.81,
  ceiling: 600,
  ceilingSoftening: 120,
  floorClearance: 20,
  // Twice the max pitch, so even a full dive becomes a full climb by the time the plane reaches
  // the ground: diving into a hill pulls up by itself.
  floorPitchBias: degToRad(50),
  floorMinAltitude: 2,
  boostAcceleration: FLIGHT_FEEL.boostAcceleration,
  boostDuration: FLIGHT_FEEL.boostDuration,
  boostCooldown: FLIGHT_FEEL.boostCooldown,
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
    yawBank: 0,
    floorContact: 0,
    boosting: false,
    boostTime: 0,
    boostCooldown: 0,
    boostSpent: false,
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
  maxRate: number,
  dt: number,
  out: SpringResult,
): SpringResult {
  const omega = 2 / Math.max(0.0001, smoothTime)
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  // Rate cap (Unity's SmoothDamp maxSpeed): the spring chases a target at most
  // `maxRate * smoothTime` away, so a big input moves at the capped rate while a small one still
  // gets the spring's full quickness.
  const maxChange = maxRate * smoothTime
  const change = clamp(current - target, -maxChange, maxChange)
  const cappedTarget = current - change
  const temp = (velocity + omega * change) * dt
  let nextVelocity = (velocity - omega * temp) * exp
  let nextValue = cappedTarget + (change + temp) * exp

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

  smoothDamp(
    state.bank,
    targetBank,
    state.bankRate,
    params.bankSmoothTime,
    params.maxBankRate,
    dt,
    bankSpring,
  )
  smoothDamp(
    state.pitchAngle,
    targetPitch,
    state.pitchRate,
    params.pitchSmoothTime,
    params.maxPitchRate,
    dt,
    pitchSpring,
  )
  const bank = bankSpring.value
  const pitchAngle = pitchSpring.value

  // Coordinated turn: bank produces a yaw rate, there's no direct yaw input. The turn follows a
  // lagged copy of the bank, so the wings lead and the nose follows. In this Y-up, forward -Z,
  // right-handed frame, a positive (rightward) rotation about +Y actually swings the nose toward
  // -X (left) -- see the forward-vector math below -- so turning right needs heading to
  // *decrease*, hence the minus sign.
  const yawLerp = params.yawLagTime > 0 ? 1 - Math.exp(-dt / params.yawLagTime) : 1
  const yawBank = state.yawBank + (bank - state.yawBank) * yawLerp
  const yawRate = -(params.turnGravity * Math.tan(yawBank)) / state.speed
  const heading = state.heading + yawRate * dt

  // Boost (#93): a request starts a burst when the cooldown is over and the last burst's request
  // has been let go. The burst ends when the request does, the autopilot takes over, or it runs
  // `boostDuration`; the cooldown starts then.
  const requested = input.active && input.boost === true
  let boosting = state.boosting
  let boostTime = state.boostTime
  let boostCooldown = Math.max(0, state.boostCooldown - dt)
  let boostSpent = state.boostSpent && requested
  if (boosting && (!requested || boostTime >= params.boostDuration)) {
    boosting = false
    boostCooldown = params.boostCooldown
    boostSpent = requested
  } else if (!boosting && requested && !boostSpent && boostCooldown === 0) {
    boosting = true
    boostTime = 0
  }
  if (boosting) boostTime += dt

  // Speed as energy: gravity along the path speeds a dive and slows a climb, and drag plus
  // throttle pull it back toward cruise. A dive's extra speed carries into the climb after it.
  // The boost pushes on top, fading out as the nose rises toward full climb, so it never cancels
  // what a climb spends.
  const pathAcceleration = -params.energyGain * Math.sin(pitchAngle)
  const decay = (params.cruiseSpeed - state.speed) / params.speedDecayTime
  const climbShare = clamp(Math.sin(pitchAngle) / Math.sin(params.maxPitchAngle), 0, 1)
  const boostAcceleration = boosting ? params.boostAcceleration * (1 - climbShare) : 0
  const speed = clamp(
    state.speed + (pathAcceleration + decay + boostAcceleration) * dt,
    params.minSpeed,
    params.maxSpeed,
  )

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
  out.yawBank = yawBank
  out.floorContact = floorDepth
  out.boosting = boosting
  out.boostTime = boostTime
  out.boostCooldown = boostCooldown
  out.boostSpent = boostSpent
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
  to.yawBank = from.yawBank
  to.floorContact = from.floorContact
  to.boosting = from.boosting
  to.boostTime = from.boostTime
  to.boostCooldown = from.boostCooldown
  to.boostSpent = from.boostSpent
  return to
}
