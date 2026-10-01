import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { surfaceHeightAt } from '../world/heightfield'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import {
  TITLE_FLYBY,
  createTitleFlybyPose,
  scriptedControl,
  titleFlyby,
  titleFlybyTime,
} from './titleFlyby'

const { period } = TITLE_FLYBY
const forward = new Vector3()

function nose(t: number): Vector3 {
  return forward.set(0, 0, -1).applyQuaternion(titleFlyby(t, 0, createTitleFlybyPose()).orientation)
}

describe('title flyby loop', () => {
  it('is a 40 to 60 s lap', () => {
    expect(period).toBeGreaterThanOrEqual(40)
    expect(period).toBeLessThanOrEqual(60)
  })

  it('closes: position and tangent are continuous at the seam', () => {
    const start = titleFlyby(0, 0, createTitleFlybyPose())
    const end = titleFlyby(period, 0, createTitleFlybyPose())
    expect(end.position.distanceTo(start.position)).toBeLessThan(1e-6)
    expect(end.bank).toBeCloseTo(start.bank, 9)

    // Just either side of the seam the plane moves one smooth step, and the nose agrees.
    const before = titleFlyby(period - 1e-3, 0, createTitleFlybyPose())
    const after = titleFlyby(1e-3, 0, createTitleFlybyPose())
    expect(after.position.distanceTo(before.position)).toBeLessThan(0.2 * 2)
    const a = nose(period - 1e-3)
    const b = nose(1e-3).clone()
    expect(a.angleTo(b)).toBeLessThan(1e-3)
  })

  it('wraps time, so a later lap repeats the first', () => {
    const a = titleFlyby(7.25, 0, createTitleFlybyPose())
    const b = titleFlyby(7.25 + 3 * period, 0, createTitleFlybyPose())
    expect(b.position.distanceTo(a.position)).toBeLessThan(1e-6)
    expect(
      titleFlyby(-period + 7.25, 0, createTitleFlybyPose()).position.distanceTo(a.position),
    ).toBeLessThan(1e-6)
  })

  it('banks with the curvature and never past 25°', () => {
    const maxBank = (25 * Math.PI) / 180
    let peak = 0
    for (let t = 0; t < period; t += 0.25) {
      const pose = titleFlyby(t, 0, createTitleFlybyPose())
      expect(Math.abs(pose.bank)).toBeLessThanOrEqual(maxBank + 1e-9)
      peak = Math.max(peak, Math.abs(pose.bank))
      // Positive bank is a right turn, and the whole loop is clockwise: it never banks left.
      expect(pose.bank).toBeGreaterThan(0)
    }
    // A real lap does bank: the loop isn't a straight line in disguise.
    expect(peak).toBeGreaterThan((12 * Math.PI) / 180)
  })

  it('banks hardest where the loop curves hardest', () => {
    // The ends of the major axis (t = 0 and period / 2 are the minor-axis ends).
    const tight = titleFlyby(period / 4, 0, createTitleFlybyPose())
    const gentle = titleFlyby(0, 0, createTitleFlybyPose())
    expect(tight.bank).toBeGreaterThan(gentle.bank)
  })

  it('reports a bank rate that matches how the bank changes', () => {
    const step = 0.1
    const a = titleFlyby(10, 0, createTitleFlybyPose())
    const b = titleFlyby(10 + step, 0, createTitleFlybyPose())
    expect(a.bankRate).toBeCloseTo((b.bank - a.bank) / step, 1)
  })

  it('flies at least 60 m above the surface all lap', () => {
    for (let t = 0; t < period; t += 0.5) {
      const { position } = titleFlyby(t, 0, createTitleFlybyPose())
      const clearance = position.y - surfaceHeightAt(position.x, position.z, TERRAIN_CONFIG)
      expect(clearance, `t = ${t}`).toBeGreaterThanOrEqual(60)
    }
  })

  it('stays near the spawn valley', () => {
    for (let t = 0; t < period; t += 1) {
      const { position } = titleFlyby(t, 0, createTitleFlybyPose())
      expect(Math.hypot(position.x - 1750, position.z - 2000)).toBeLessThan(600)
    }
  })
})

describe('title camera', () => {
  function screenOf(aspect: number, t: number, lean: number): { x: number; y: number } {
    const pose = titleFlyby(t, lean, createTitleFlybyPose())
    const camera = new PerspectiveCamera(TITLE_FLYBY.fov, aspect, 1, 20000)
    camera.position.copy(pose.cameraPosition)
    camera.lookAt(pose.cameraLookAt)
    camera.updateMatrixWorld()
    const ndc = pose.position.clone().project(camera)
    return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2 }
  }

  it('keeps the plane in the right two thirds at lean 0, sampled every second', () => {
    for (let t = 0; t < period; t += 1) {
      const { x, y } = screenOf(16 / 9, t, 0)
      expect(x, `x at t = ${t}`).toBeGreaterThanOrEqual(0.4)
      expect(x, `x at t = ${t}`).toBeLessThanOrEqual(0.92)
      expect(y, `y at t = ${t}`).toBeGreaterThanOrEqual(0.45)
      expect(y, `y at t = ${t}`).toBeLessThanOrEqual(0.85)
    }
  })

  it('puts the horizon in the upper half at the frozen shot', () => {
    const pose = titleFlyby(TITLE_FLYBY.shotTime, 0, createTitleFlybyPose())
    const camera = new PerspectiveCamera(TITLE_FLYBY.fov, 16 / 9, 1, 20000)
    camera.position.copy(pose.cameraPosition)
    camera.lookAt(pose.cameraLookAt)
    camera.updateMatrixWorld()
    const toward = pose.cameraLookAt.clone().sub(pose.cameraPosition).setY(0).normalize()
    const horizon = pose.cameraPosition
      .clone()
      .addScaledVector(toward, 50000)
      .setY(pose.cameraPosition.y)
    expect((1 - horizon.project(camera).y) / 2).toBeLessThan(0.4)
  })

  it('at lean 1 is closer and centred', () => {
    for (let t = 0; t < period; t += 4) {
      const masthead = titleFlyby(t, 0, createTitleFlybyPose())
      const choose = titleFlyby(t, 1, createTitleFlybyPose())
      expect(choose.cameraPosition.distanceTo(choose.position)).toBeLessThan(
        masthead.cameraPosition.distanceTo(masthead.position),
      )
      const { x, y } = screenOf(16 / 9, t, 1)
      expect(Math.abs(x - 0.5)).toBeLessThan(0.05)
      expect(y).toBeGreaterThan(0.45)
      expect(y).toBeLessThan(0.65)
    }
  })

  it('blends monotonically between the two framings', () => {
    let last = Infinity
    for (let lean = 0; lean <= 1.0001; lean += 0.1) {
      const pose = titleFlyby(12, lean, createTitleFlybyPose())
      const distance = pose.cameraPosition.distanceTo(pose.position)
      expect(distance).toBeLessThanOrEqual(last + 1e-9)
      last = distance
    }
  })

  it('does not change the plane with the lean', () => {
    const a = titleFlyby(20, 0, createTitleFlybyPose())
    const b = titleFlyby(20, 1, createTitleFlybyPose())
    expect(b.position.distanceTo(a.position)).toBe(0)
    expect(b.bank).toBe(a.bank)
  })
})

describe('titleFlybyTime', () => {
  it('runs with the clock, and freezes at the shot time', () => {
    expect(titleFlybyTime(10, false)).toBeCloseTo(10 + TITLE_FLYBY.shotTime)
    expect(titleFlybyTime(10, true)).toBe(TITLE_FLYBY.shotTime)
    expect(titleFlybyTime(99, true)).toBe(TITLE_FLYBY.shotTime)
  })
})

describe('scriptedControl', () => {
  const out = { roll: 0, pitch: 0, active: false, confidence: 0, source: 'keyboard' as const }

  it('rolls the ailerons with the bank rate, clamped', () => {
    expect(scriptedControl(0, out).roll).toBe(0)
    expect(scriptedControl(10, out).roll).toBe(1)
    expect(scriptedControl(-10, out).roll).toBe(-1)
    expect(scriptedControl(0.05, out).roll).toBeGreaterThan(0)
    expect(out.active).toBe(true)
  })
})
