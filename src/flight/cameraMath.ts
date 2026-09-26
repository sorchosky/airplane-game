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
}

export const CHASE_CAMERA_PARAMS: ChaseCameraParams = {
  offsetBack: 12,
  offsetUp: 4,
  positionDampingRate: 6,
  lookAtDampingRate: 8,
  rollFraction: 0.25,
  fovBase: 60,
  fovMax: 68,
  fovMinSpeed: 45,
  fovMaxSpeed: 60,
}

/** `prefers-reduced-motion` variant: no camera roll, no FOV kick. */
export function reducedMotionChaseCameraParams(params: ChaseCameraParams): ChaseCameraParams {
  return { ...params, rollFraction: 0, fovMax: params.fovBase }
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
 * frame (yaw only), not its full orientation -- so the camera doesn't swing with bank or pitch.
 */
export function desiredCameraPosition(
  planePosition: Vector3,
  heading: number,
  params: ChaseCameraParams,
  out: Vector3 = new Vector3(),
): Vector3 {
  // Forward = (-sin(heading), 0, -cos(heading)) (see flightModel.ts), so "back" is the negation.
  const backX = Math.sin(heading) * params.offsetBack
  const backZ = Math.cos(heading) * params.offsetBack
  return out.set(
    planePosition.x + backX,
    planePosition.y + params.offsetUp,
    planePosition.z + backZ,
  )
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
