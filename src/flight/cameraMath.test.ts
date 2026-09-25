import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  CHASE_CAMERA_PARAMS,
  chaseCameraFov,
  chaseCameraOrientation,
  dampVector3,
  desiredCameraPosition,
  expDamp,
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
