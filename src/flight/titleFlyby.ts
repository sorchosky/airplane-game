import { Quaternion, Vector3 } from 'three'
import type { ControlInput } from '../input/types'
import { DEFAULT_FLIGHT_PARAMS } from './flightModel'

/**
 * The title flyby (#157): a scripted, closed loop for the plane behind the front door, and the
 * camera that frames it. A script rather than the sim on autopilot, so the plane never crosses the
 * left-third masthead and a `?shot=title` capture is deterministic. Pure: plain TS over Three math
 * types, no React and no stores. Everything is written into a caller-owned `TitleFlybyPose`, so a
 * frame allocates nothing.
 *
 * Units: metres, seconds, radians. Y up, forward is (-sin h, 0, -cos h), positive bank is a right
 * turn (the heading decreases), the same conventions as `flightModel.ts`.
 */
export interface TitleFlybyParams {
  /** s for one lap. */
  period: number
  /** Loop centre, world m (the spawn valley). */
  centerX: number
  centerZ: number
  /** Semi-axes of the ellipse, m. East-west and north-south. */
  radiusX: number
  radiusZ: number
  /** Mean height, m, and how far it swells up and down once per lap. */
  altitude: number
  altitudeSwing: number
  /** Radians. Bank is a smooth saturation of the coordinated-turn bank, so it never exceeds this. */
  maxBank: number
  /** The `t` (s) `?shot=title` and reduced motion freeze the loop at. */
  shotTime: number
  /** Camera offset in the camera frame, m: [right, up, forward]. Negative forward is behind. */
  mastheadOffset: readonly [number, number, number]
  /** Where the camera aims, m from the plane, in the camera frame: [right, up, forward]. */
  mastheadLook: readonly [number, number, number]
  /** The Choose framing: closer and centred, so the plane sits behind the frames. */
  chooseOffset: readonly [number, number, number]
  chooseLook: readonly [number, number, number]
  /** Radians the camera frame swings either side of the plane's heading, once per lap. */
  cameraYawSwing: number
  /** m the masthead camera drifts in right, up and back over a lap. */
  cameraDrift: readonly [number, number, number]
  /** Vertical field of view, degrees. */
  fov: number
}

const deg = (degrees: number): number => (degrees * Math.PI) / 180

export const TITLE_FLYBY: TitleFlybyParams = {
  period: 48,
  centerX: 1750,
  centerZ: 2000,
  // About 2.15 km a lap: 45 m/s, the cruise speed, on average.
  radiusX: 380,
  radiusZ: 300,
  altitude: 150,
  altitudeSwing: 10,
  maxBank: deg(25),
  shotTime: 6,
  // Behind, above and left of the plane, aimed left of it and above the lens: the plane lands in
  // the right two thirds while the slight upward pitch holds the horizon near 60% screen height.
  mastheadOffset: [-9, 3, -26],
  mastheadLook: [-9, 6.35, 0],
  chooseOffset: [0, 3.5, -13],
  chooseLook: [0, 1.5, 0],
  cameraYawSwing: 0.3,
  cameraDrift: [3, 0.9, 3],
  fov: 60,
}

export interface TitleFlybyPose {
  position: Vector3
  /** Plane orientation: yaw, then pitch, then roll about the nose, like `flightModel.integrate`. */
  orientation: Quaternion
  /** Radians, positive banks right. */
  bank: number
  /** rad/s */
  bankRate: number
  heading: number
  pitchAngle: number
  /** m/s along the path. */
  speed: number
  cameraPosition: Vector3
  cameraLookAt: Vector3
}

export function createTitleFlybyPose(): TitleFlybyPose {
  return {
    position: new Vector3(),
    orientation: new Quaternion(),
    bank: 0,
    bankRate: 0,
    heading: 0,
    pitchAngle: 0,
    speed: 0,
    cameraPosition: new Vector3(),
    cameraLookAt: new Vector3(),
  }
}

/**
 * Bank at `t`: the coordinated-turn bank for the loop's curvature, squashed with tanh so it follows
 * the curvature and never passes `maxBank`. Scalars only, so sampling it allocates nothing.
 */
function bankAt(t: number, p: TitleFlybyParams): number {
  const w = (Math.PI * 2) / p.period
  const sin = Math.sin(w * t)
  const cos = Math.cos(w * t)
  const vx = p.radiusX * w * cos
  const vz = p.radiusZ * w * sin
  const ax = -p.radiusX * w * w * sin
  const az = p.radiusZ * w * w * cos
  const v2 = vx * vx + vz * vz
  // Heading is atan2(-vx, -vz), so its rate is (vz·ax − vx·az) / |v|²; a right turn lowers it.
  const turnRate = -(vz * ax - vx * az) / v2
  const natural = Math.atan((turnRate * Math.sqrt(v2)) / DEFAULT_FLIGHT_PARAMS.turnGravity)
  return p.maxBank * Math.tanh(natural / p.maxBank)
}

/** Seconds either side of `t` for the finite difference that gives the bank rate. */
const BANK_RATE_STEP = 0.05

const yawQ = new Quaternion()
const pitchQ = new Quaternion()
const rollQ = new Quaternion()
const AXIS_Y = new Vector3(0, 1, 0)
const AXIS_X = new Vector3(1, 0, 0)
const AXIS_Z = new Vector3(0, 0, 1)

/** Writes `base + right·R + up·U + forward·F` for the camera frame at `yaw` into `out`. */
function placeInFrame(
  out: Vector3,
  px: number,
  py: number,
  pz: number,
  yaw: number,
  right: number,
  up: number,
  forward: number,
): void {
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  out.set(px + right * cos - forward * sin, py + up, pz - right * sin - forward * cos)
}

function mix(a: number, b: number, k: number): number {
  return a + (b - a) * k
}

/**
 * The loop at time `t` (s, wraps every `period`), with the camera at `lean` (0 = masthead framing,
 * 1 = Choose framing). Everything but the camera is independent of `lean`.
 */
export function titleFlyby(
  t: number,
  lean: number,
  out: TitleFlybyPose,
  p: TitleFlybyParams = TITLE_FLYBY,
): TitleFlybyPose {
  const wrapped = ((t % p.period) + p.period) % p.period
  const k = Math.min(Math.max(lean, 0), 1)

  // East at the north end of the loop, then south down the east side: clockwise from above.
  const w = (Math.PI * 2) / p.period
  const sin = Math.sin(w * wrapped)
  const cos = Math.cos(w * wrapped)
  const x = p.centerX + p.radiusX * sin
  const y = p.altitude + p.altitudeSwing * sin
  const z = p.centerZ - p.radiusZ * cos
  const vx = p.radiusX * w * cos
  const vz = p.radiusZ * w * sin
  const vy = p.altitudeSwing * w * cos
  const horizontal = Math.sqrt(vx * vx + vz * vz)
  const heading = Math.atan2(-vx, -vz)
  const pitch = Math.atan2(vy, horizontal)
  const bank = bankAt(wrapped, p)
  const bankRate =
    (bankAt(wrapped + BANK_RATE_STEP, p) - bankAt(wrapped - BANK_RATE_STEP, p)) /
    (2 * BANK_RATE_STEP)

  out.position.set(x, y, z)
  yawQ.setFromAxisAngle(AXIS_Y, heading)
  pitchQ.setFromAxisAngle(AXIS_X, pitch)
  rollQ.setFromAxisAngle(AXIS_Z, -bank)
  out.orientation.copy(yawQ).multiply(pitchQ).multiply(rollQ)
  out.bank = bank
  out.bankRate = bankRate
  out.heading = heading
  out.pitchAngle = pitch
  out.speed = Math.sqrt(horizontal * horizontal + vy * vy)

  // The camera frame swings either side of the plane's heading and drifts a few metres, so the
  // plane's aspect and the backdrop change lap to lap; the Choose framing is steady.
  const phase = w * wrapped
  const swing = (1 - k) * p.cameraYawSwing * Math.sin(2 * phase)
  const frame = heading + swing
  const drift = 1 - k
  const mo = p.mastheadOffset
  const ml = p.mastheadLook
  const co = p.chooseOffset
  const cl = p.chooseLook
  const right = mix(mo[0] + drift * p.cameraDrift[0] * Math.sin(phase), co[0], k)
  const up = mix(mo[1] + drift * p.cameraDrift[1] * Math.sin(phase * 3), co[1], k)
  const forward = mix(mo[2] - drift * p.cameraDrift[2] * Math.cos(phase), co[2], k)
  placeInFrame(out.cameraPosition, x, y, z, frame, right, up, forward)
  placeInFrame(
    out.cameraLookAt,
    x,
    y,
    z,
    frame,
    mix(ml[0], cl[0], k),
    mix(ml[1], cl[1], k),
    mix(ml[2], cl[2], k),
  )
  return out
}

/**
 * The loop time for a frame: the running clock, or `shotTime` when frozen (`?shot=title` and
 * reduced motion).
 */
export function titleFlybyTime(
  elapsed: number,
  frozen: boolean,
  p: TitleFlybyParams = TITLE_FLYBY,
) {
  return frozen ? p.shotTime : elapsed + p.shotTime
}

/** Bank rate, rad/s, that deflects the ailerons fully when the scripted plane rolls. */
const FULL_AILERON_BANK_RATE = deg(12)

/**
 * The stick the scripted plane appears to be flying with, so the model's own surface rig animates:
 * ailerons follow the roll-in and roll-out, and the rudder follows the bank (the rig reads it from
 * the flight state). Written into `out`.
 */
export function scriptedControl(bankRate: number, out: ControlInput): ControlInput {
  out.roll = Math.min(Math.max(bankRate / FULL_AILERON_BANK_RATE, -1), 1)
  out.pitch = 0
  out.active = true
  out.confidence = 1
  out.source = 'replay'
  return out
}
