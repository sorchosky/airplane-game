import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  CHASE_CAMERA_PARAMS,
  chaseCameraFov,
  chaseCameraOrientation,
  dampVector3,
  desiredCameraPosition,
  expDamp,
  framedLookAt,
  reducedMotionChaseCameraParams,
} from './cameraMath'

describe('expDamp', () => {
  it('does not move at dt=0', () => {
    expect(expDamp(0, 10, 6, 0)).toBe(0)
  })

  it('moves toward the target without overshooting', () => {
    const next = expDamp(0, 10, 6, 1 / 60)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(10)
  })

  it('converges to the target over many small steps', () => {
    let value = 0
    for (let i = 0; i < 600; i++) value = expDamp(value, 10, 6, 1 / 60)
    expect(value).toBeCloseTo(10, 2)
  })

  it('gives the same converged result regardless of step size (frame-rate independence)', () => {
    let fine = 0
    for (let i = 0; i < 600; i++) fine = expDamp(fine, 10, 6, 1 / 60)

    let coarse = 0
    for (let i = 0; i < 30; i++) coarse = expDamp(coarse, 10, 6, 1)

    expect(coarse).toBeCloseTo(fine, 1)
  })
})

describe('dampVector3', () => {
  it('does not mutate its inputs', () => {
    const current = new Vector3(0, 0, 0)
    const target = new Vector3(10, 10, 10)
    dampVector3(current, target, 6, 1 / 60)
    expect(current).toEqual(new Vector3(0, 0, 0))
    expect(target).toEqual(new Vector3(10, 10, 10))
  })

  it('damps each axis toward the target', () => {
    const current = new Vector3(0, 0, 0)
    const target = new Vector3(10, -4, 2)
    const next = dampVector3(current, target, 6, 1 / 60)
    expect(next.x).toBeGreaterThan(0)
    expect(next.x).toBeLessThan(10)
    expect(next.y).toBeLessThan(0)
    expect(next.y).toBeGreaterThan(-4)
  })
})

describe('desiredCameraPosition', () => {
  it('sits behind and above the plane on heading 0', () => {
    const planePosition = new Vector3(0, 100, 0)
    const target = desiredCameraPosition(planePosition, 0, CHASE_CAMERA_PARAMS)
    // forward on heading 0 is -Z, so "back" is +Z.
    expect(target.x).toBeCloseTo(0)
    expect(target.z).toBeCloseTo(CHASE_CAMERA_PARAMS.offsetBack)
    expect(target.y).toBeCloseTo(planePosition.y + CHASE_CAMERA_PARAMS.offsetUp)
  })

  it('rotates the offset with heading, ignoring bank and pitch', () => {
    const planePosition = new Vector3(0, 0, 0)
    const target = desiredCameraPosition(planePosition, Math.PI / 2, CHASE_CAMERA_PARAMS)
    expect(target.x).toBeCloseTo(CHASE_CAMERA_PARAMS.offsetBack)
    expect(target.z).toBeCloseTo(0, 5)
  })

  it('swings to the outside of the turn and rises, in proportion to the lagged bank', () => {
    const planePosition = new Vector3(0, 100, 0)
    const bank = (40 * Math.PI) / 180
    const level = desiredCameraPosition(planePosition, 0, CHASE_CAMERA_PARAMS)
    const right = desiredCameraPosition(planePosition, 0, CHASE_CAMERA_PARAMS, undefined, bank)
    const left = desiredCameraPosition(planePosition, 0, CHASE_CAMERA_PARAMS, undefined, -bank)
    // Heading 0 faces -Z with the plane's right on +X, so the outside of a right turn is -X.
    expect(right.x).toBeLessThan(-1)
    expect(left.x).toBeCloseTo(-right.x, 5)
    expect(right.y).toBeGreaterThan(level.y)
    expect(left.y).toBeCloseTo(right.y, 5)
    // An orbit, not a slide: the distance behind stays the same.
    expect(Math.hypot(right.x, right.z)).toBeCloseTo(CHASE_CAMERA_PARAMS.offsetBack, 5)
    const doubled = desiredCameraPosition(
      planePosition,
      0,
      CHASE_CAMERA_PARAMS,
      undefined,
      2 * bank,
    )
    const yaw = (p: Vector3) => Math.atan2(-p.x, p.z)
    expect(yaw(doubled)).toBeCloseTo(2 * yaw(right), 5)
  })

  it("sits on the outside (the plane's left) in a right turn at any heading", () => {
    const heading = -0.8
    const bank = 0.6
    const planePosition = new Vector3(0, 0, 0)
    const camera = desiredCameraPosition(
      planePosition,
      heading,
      CHASE_CAMERA_PARAMS,
      undefined,
      bank,
    )
    const planeRight = new Vector3(Math.cos(heading), 0, -Math.sin(heading))
    expect(camera.clone().sub(planePosition).dot(planeRight)).toBeLessThan(0)
  })
})

describe('framedLookAt', () => {
  function screenYOf(cameraPosition: Vector3, aim: Vector3, subject: Vector3, fov: number) {
    const camera = new PerspectiveCamera(fov, 16 / 9, 1, 1000)
    camera.position.copy(cameraPosition)
    camera.lookAt(aim)
    camera.updateMatrixWorld()
    return subject.clone().project(camera)
  }

  it('puts the subject at the requested NDC height, centred left to right', () => {
    const cameraPosition = new Vector3(3, 104, 10)
    const subject = new Vector3(0, 100, 0)
    const aim = framedLookAt(cameraPosition, subject, 60, CHASE_CAMERA_PARAMS.screenY)
    const ndc = screenYOf(cameraPosition, aim, subject, 60)
    expect(ndc.y).toBeCloseTo(CHASE_CAMERA_PARAMS.screenY, 5)
    expect(ndc.x).toBeCloseTo(0, 5)
  })

  it('frames the default chase in the lower-centre third', () => {
    expect(CHASE_CAMERA_PARAMS.screenY).toBeLessThan(-1 / 3)
    expect(CHASE_CAMERA_PARAMS.screenY).toBeGreaterThan(-0.6)
  })

  it('aims straight at the subject at screenY 0', () => {
    const cameraPosition = new Vector3(0, 4, 12)
    const subject = new Vector3(0, 0, 0)
    expect(framedLookAt(cameraPosition, subject, 60, 0).distanceTo(subject)).toBeCloseTo(0, 6)
  })

  it('writes into out and leaves its inputs alone', () => {
    const cameraPosition = new Vector3(0, 4, 12)
    const subject = new Vector3(0, 0, 0)
    const out = new Vector3()
    expect(framedLookAt(cameraPosition, subject, 60, -0.4, out)).toBe(out)
    expect(subject).toEqual(new Vector3(0, 0, 0))
    expect(cameraPosition).toEqual(new Vector3(0, 4, 12))
  })
})

describe('chaseCameraFov', () => {
  it('is fovBase at or below fovMinSpeed', () => {
    expect(chaseCameraFov(30, CHASE_CAMERA_PARAMS)).toBeCloseTo(CHASE_CAMERA_PARAMS.fovBase)
  })

  it('is fovMax at or above fovMaxSpeed', () => {
    expect(chaseCameraFov(100, CHASE_CAMERA_PARAMS)).toBeCloseTo(CHASE_CAMERA_PARAMS.fovMax)
  })

  it('interpolates in between', () => {
    const mid = (CHASE_CAMERA_PARAMS.fovMinSpeed + CHASE_CAMERA_PARAMS.fovMaxSpeed) / 2
    const fov = chaseCameraFov(mid, CHASE_CAMERA_PARAMS)
    expect(fov).toBeGreaterThan(CHASE_CAMERA_PARAMS.fovBase)
    expect(fov).toBeLessThan(CHASE_CAMERA_PARAMS.fovMax)
  })
})

describe('reducedMotionChaseCameraParams', () => {
  it('zeroes roll and locks FOV to the base value', () => {
    const reduced = reducedMotionChaseCameraParams(CHASE_CAMERA_PARAMS)
    expect(reduced.rollFraction).toBe(0)
    expect(reduced.fovMax).toBe(reduced.fovBase)
    expect(chaseCameraFov(100, reduced)).toBe(reduced.fovBase)
  })

  it('keeps the lead into turns, at half strength', () => {
    const reduced = reducedMotionChaseCameraParams(CHASE_CAMERA_PARAMS)
    expect(reduced.leadYawPerBank).toBeCloseTo(CHASE_CAMERA_PARAMS.leadYawPerBank / 2)
    expect(reduced.screenY).toBe(CHASE_CAMERA_PARAMS.screenY)
  })
})

describe('chaseCameraOrientation', () => {
  it('looks toward the look-at target', () => {
    const cameraPosition = new Vector3(0, 4, 12)
    const lookAtPosition = new Vector3(0, 0, 0)
    const q = chaseCameraOrientation(cameraPosition, lookAtPosition, 0, 0.25)
    const forward = new Vector3(0, 0, -1).applyQuaternion(q)
    const expected = lookAtPosition.clone().sub(cameraPosition).normalize()
    expect(forward.dot(expected)).toBeCloseTo(1, 5)
  })

  it('rolls the opposite way for opposite bank signs', () => {
    const cameraPosition = new Vector3(0, 4, 12)
    const lookAtPosition = new Vector3(0, 0, 0)
    const qRight = chaseCameraOrientation(cameraPosition, lookAtPosition, 0.5, 0.25)
    const qLeft = chaseCameraOrientation(cameraPosition, lookAtPosition, -0.5, 0.25)
    const upRight = new Vector3(0, 1, 0).applyQuaternion(qRight)
    const upLeft = new Vector3(0, 1, 0).applyQuaternion(qLeft)
    expect(upRight.x).toBeGreaterThan(0)
    expect(upLeft.x).toBeLessThan(0)
    expect(upRight.x).toBeCloseTo(-upLeft.x, 5)
  })

  it('stays unrolled at zero bank', () => {
    const cameraPosition = new Vector3(0, 4, 12)
    const lookAtPosition = new Vector3(0, 0, 0)
    const q = chaseCameraOrientation(cameraPosition, lookAtPosition, 0, 0.25)
    const up = new Vector3(0, 1, 0).applyQuaternion(q)
    expect(up.x).toBeCloseTo(0, 5)
  })
})
