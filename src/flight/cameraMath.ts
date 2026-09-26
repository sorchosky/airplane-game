import { Matrix4, Quaternion, Vector3 } from 'three'
import { clamp } from '../input/clamp'

export interface ChaseCameraParams {
  offsetBack: number // m, behind the plane along its heading
  offsetUp: number // m, above the plane
  positionDampingRate: number // 1/s, exponential damping rate for camera position
  lookAtDampingRate: number // 1/s, exponential damping rate for the look-at target
  rollFraction: number // fraction (0..1) of the plane's bank applied to camera roll
  fovBase: number // degrees, FOV at or below fovMinSpeed
  fovMax: number // degrees, FOV at or above fovMaxSpeed
  fovMinSpeed: number // m/s
  fovMaxSpeed: number // m/s
  leadYawPerBank: number // rad of camera orbit toward the outside of a turn, per rad of lagged bank
  risePerBank: number // m of extra height per rad of |lagged bank|
  screenY: number // NDC height the plane is framed at, -1 (bottom) .. 1 (top); < -1/3 is the lower third
}

export const CHASE_CAMERA_PARAMS: ChaseCameraParams = {
  offsetBack: 11,
  offsetUp: 3.5,
  positionDampingRate: 6,
  lookAtDampingRate: 8,
  rollFraction: 0.25,
  fovBase: 60,
  fovMax: 68,
  fovMinSpeed: 45,
  fovMaxSpeed: 60,
  // At a 50° bank the camera swings ~15° (about 3 m) to the outside of the turn, so the view
  // looks into the turn instead of at the tail, and the wing's top surface faces the lens.
  leadYawPerBank: 0.3,
  risePerBank: 1.5,
  // The plane's centre sits just inside the lower-centre third (70 % down the screen), leaving
  // the upper two thirds for the horizon and where the plane is going.
  screenY: -0.4,
}

/**
 * `prefers-reduced-motion` variant: no camera roll, no FOV kick, and half the orbit into turns
 * (the lead still shows the turn, but the view swings less).
 */
export function reducedMotionChaseCameraParams(params: ChaseCameraParams): ChaseCameraParams {
  return {
    ...params,
    rollFraction: 0,
    fovMax: params.fovBase,
    leadYawPerBank: params.leadYawPerBank / 2,
  }
}

/** Frame-rate-independent exponential damping: blends `current` toward `target` at `rate` (1/s). */
export function expDamp(current: number, target: number, rate: number, dt: number): number {
  const t = 1 - Math.exp(-rate * dt)
  return current + (target - current) * t
}

/**
 * Component-wise `expDamp` over a Vector3, written into `out` (a fresh Vector3 by default, so
 * the inputs stay untouched). `out` may be `current` itself for an in-place update.
 */
export function dampVector3(
  current: Vector3,
  target: Vector3,
  rate: number,
  dt: number,
  out: Vector3 = new Vector3(),
): Vector3 {
  const t = 1 - Math.exp(-rate * dt)
  return out.copy(current).lerp(target, t)
}

/**
 * The camera's target position: behind and above the plane, offset in the plane's *heading*
 * frame (yaw only), not its full orientation -- so the camera doesn't swing with the wings or the
 * nose. In a turn it orbits toward the outside and rises, by amounts proportional to `bank`: pass
 * the lagged bank the heading follows (`FlightState.yawBank`), so the camera leads with the turn
 * rather than twitching with every roll input.
 */
export function desiredCameraPosition(
  planePosition: Vector3,
  heading: number,
  params: ChaseCameraParams,
  out: Vector3 = new Vector3(),
  bank = 0,
): Vector3 {
  // Rotating "back" by -δ about +Y swings it toward the plane's left (back · right = -sin δ):
  // for a right bank that is the outside of the turn.
  const orbit = heading - params.leadYawPerBank * bank
  // Forward = (-sin(heading), 0, -cos(heading)) (see flightModel.ts), so "back" is the negation.
  const backX = Math.sin(orbit) * params.offsetBack
  const backZ = Math.cos(orbit) * params.offsetBack
  return out.set(
    planePosition.x + backX,
    planePosition.y + params.offsetUp + params.risePerBank * Math.abs(bank),
    planePosition.z + backZ,
  )
}

// Scratch for `framedLookAt`; never escapes the function.
const toSubjectScratch = new Vector3()
const frameUpScratch = new Vector3()

/**
 * The point to aim the camera at so `subject` lands at NDC height `screenY` (negative = below the
 * centre) instead of dead centre. Offsets the aim along the view's up direction by the distance
 * that subtends the right angle at the given vertical FOV (degrees). Ignores camera roll, which
 * only nudges the subject sideways by a few percent. Written into `out`.
 */
export function framedLookAt(
  cameraPosition: Vector3,
  subject: Vector3,
  fovDegrees: number,
  screenY: number,
  out: Vector3 = new Vector3(),
): Vector3 {
  const toSubject = toSubjectScratch.copy(subject).sub(cameraPosition)
  const distance = toSubject.length()
  if (distance < 1e-6) return out.copy(subject)
  toSubject.divideScalar(distance)
  // World up with its along-view part removed: the view's vertical in the plane of the aim.
  const up = frameUpScratch.set(0, 1, 0).addScaledVector(toSubject, -toSubject.y)
  if (up.lengthSq() < 1e-9) return out.copy(subject)
  up.normalize()
  const halfFov = (fovDegrees * Math.PI) / 360
  // Aiming `lift` above the subject puts it `atan(lift / distance)` below the view axis, which
  // projects to NDC -lift / (distance * tan(halfFov)).
  const lift = -screenY * distance * Math.tan(halfFov)
  return out.copy(subject).addScaledVector(up, lift)
}

// Scratch for `chaseCameraOrientation`; never escapes the function.
const forwardScratch = new Vector3()
const upScratch = new Vector3()
const matrixScratch = new Matrix4()

/**
 * Camera orientation looking from `cameraPosition` to `lookAtPosition`, rolled about its forward
 * axis by `rollFraction` of the plane's bank -- a sense of motion without copying the full bank.
 * Written into `out` (a fresh Quaternion by default).
 */
export function chaseCameraOrientation(
  cameraPosition: Vector3,
  lookAtPosition: Vector3,
  bank: number,
  rollFraction: number,
  out: Quaternion = new Quaternion(),
): Quaternion {
  const forward = forwardScratch.copy(lookAtPosition).sub(cameraPosition)
  if (forward.lengthSq() < 1e-9) forward.set(0, 0, -1)
  forward.normalize()

  const up = upScratch.set(0, 1, 0).applyAxisAngle(forward, bank * rollFraction)
  matrixScratch.lookAt(cameraPosition, lookAtPosition, up)
  return out.setFromRotationMatrix(matrixScratch)
}

/** Subtle FOV widening as speed rises from `fovMinSpeed` to `fovMaxSpeed`, degrees. */
export function chaseCameraFov(speed: number, params: ChaseCameraParams): number {
  const span = params.fovMaxSpeed - params.fovMinSpeed
  const t = span <= 0 ? 0 : clamp((speed - params.fovMinSpeed) / span, 0, 1)
  return params.fovBase + (params.fovMax - params.fovBase) * t
}
