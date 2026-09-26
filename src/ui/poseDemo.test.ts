import { describe, expect, it } from 'vitest'
import {
  DEMO_FPS,
  DEMO_HOLD_MS,
  DEMO_KEYS,
  DEMO_LOOP_MS,
  DEMO_MOVE_MS,
  demoFigure,
  demoFrameIndex,
  demoPose,
} from './poseDemo'

const slot = DEMO_HOLD_MS + DEMO_MOVE_MS

describe('demoPose', () => {
  it('holds each of the three frames in order: arms out, lean, arms up', () => {
    DEMO_KEYS.forEach((key, i) => {
      const pose = demoPose(i * slot + DEMO_HOLD_MS / 2)
      expect(pose.lean).toBeCloseTo(key.lean)
      expect(pose.armRaise).toBeCloseTo(key.armRaise)
    })
    expect(DEMO_KEYS[1]?.lean).toBeGreaterThan(0)
    expect(DEMO_KEYS[2]?.armRaise).toBeGreaterThan(0)
  })

  it('eases between frames, halfway at the middle of a move', () => {
    const [from, to] = DEMO_KEYS
    const pose = demoPose(DEMO_HOLD_MS + DEMO_MOVE_MS / 2)
    expect(pose.lean).toBeCloseTo(((from?.lean ?? 0) + (to?.lean ?? 0)) / 2, 1)
  })

  it('loops back to arms out', () => {
    expect(demoPose(DEMO_LOOP_MS + 10)).toEqual(demoPose(10))
    const last = DEMO_KEYS[DEMO_KEYS.length - 1]
    expect(demoPose(DEMO_LOOP_MS - 1).armRaise).toBeLessThan(last?.armRaise ?? 0)
  })

  it('steps at 24 fps: times inside one frame give the same pose', () => {
    const frameMs = 1000 / DEMO_FPS
    // Frame 20 starts at 833 ms, inside the first move.
    const t = 20 * frameMs
    expect(demoFrameIndex(t + 1)).toBe(demoFrameIndex(t + frameMs - 1))
    expect(demoPose(t + 1)).toEqual(demoPose(t + frameMs - 1))
    expect(demoPose(t + frameMs + 1)).not.toEqual(demoPose(t + 1))
  })
})

describe('demoFigure', () => {
  it('is level and symmetric with the arms out', () => {
    const f = demoFigure({ lean: 0, armRaise: 0 })
    expect(f.leftWrist.y).toBeCloseTo(f.neck.y)
    expect(f.rightWrist.y).toBeCloseTo(f.neck.y)
    expect(f.neck.x - f.leftWrist.x).toBeCloseTo(f.rightWrist.x - f.neck.x)
    expect(f.head.y).toBeLessThan(f.neck.y)
  })

  it('leaning tips the arm line and head about the planted hips', () => {
    const f = demoFigure({ lean: 0.3, armRaise: 0 })
    expect(f.rightWrist.y).toBeGreaterThan(f.leftWrist.y)
    expect(f.head.x).toBeGreaterThan(f.hip.x)
    const still = demoFigure({ lean: 0, armRaise: 0 })
    expect(f.leftFoot).toEqual(still.leftFoot)
    expect(f.hip).toEqual(still.hip)
  })

  it('raising the arms lifts both wrists above the shoulders', () => {
    const f = demoFigure({ lean: 0, armRaise: 0.6 })
    expect(f.leftWrist.y).toBeLessThan(f.neck.y)
    expect(f.rightWrist.y).toBeCloseTo(f.leftWrist.y)
  })

  it('stays inside the 160 × 160 viewBox in every frame', () => {
    for (let t = 0; t < DEMO_LOOP_MS; t += 1000 / DEMO_FPS) {
      const f = demoFigure(demoPose(t))
      for (const p of Object.values(f)) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(160)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(160)
      }
    }
  })
})
