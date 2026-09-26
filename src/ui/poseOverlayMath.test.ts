import { describe, expect, it } from 'vitest'
import { LANDMARK, LANDMARK_COUNT } from '../pose/landmarks'
import type { PoseLandmark } from '../pose/types'
import {
  armLine,
  coverTransform,
  createSkeleton,
  HEAD_RADIUS_PER_SHOULDER,
  JOINT,
  pulse,
  PULSE_PERIOD_MS,
  SKELETON_JOINTS,
  SKELETON_SEGMENTS,
  skeletonPoints,
  TARGET_ALPHA,
  TARGET_POSE,
  TARGET_SCALE_SWING,
  targetSkeleton,
  targetStyle,
  toCanvasPoint,
} from './poseOverlayMath'

function pose(points: Partial<Record<number, [number, number]>>): PoseLandmark[] {
  return Array.from({ length: LANDMARK_COUNT }, (_, i) => {
    const [x, y] = points[i] ?? [0.5, 0.5]
    return { x, y, z: 0, visibility: 1 }
  })
}

describe('coverTransform', () => {
  it('is the identity scale when aspects match', () => {
    expect(coverTransform({ width: 640, height: 480 }, { width: 320, height: 240 })).toEqual({
      scale: 0.5,
      offsetX: 0,
      offsetY: 0,
      width: 320,
      height: 240,
    })
  })

  it('crops the sides of a wider video, centered', () => {
    // 16:9 video in a 4:3 canvas: height fills, width overflows.
    const t = coverTransform({ width: 1280, height: 720 }, { width: 400, height: 300 })
    expect(t?.scale).toBeCloseTo(300 / 720)
    expect(t?.height).toBeCloseTo(300)
    expect(t?.width).toBeCloseTo(1280 * (300 / 720))
    expect(t?.offsetX).toBeCloseTo((400 - 1280 * (300 / 720)) / 2)
    expect(t?.offsetY).toBe(0)
  })

  it('crops the top and bottom of a taller video, centered', () => {
    const t = coverTransform({ width: 480, height: 640 }, { width: 400, height: 300 })
    expect(t?.width).toBeCloseTo(400)
    expect(t?.offsetX).toBe(0)
    expect(t?.offsetY).toBeCloseTo((300 - 640 * (400 / 480)) / 2)
  })

  it('returns null before the video or canvas has a size', () => {
    expect(coverTransform({ width: 0, height: 0 }, { width: 400, height: 300 })).toBeNull()
    expect(coverTransform({ width: 640, height: 480 }, { width: 0, height: 300 })).toBeNull()
  })
})

describe('toCanvasPoint', () => {
  const t = coverTransform({ width: 1280, height: 720 }, { width: 400, height: 300 })!

  it('keeps the image center at the canvas center', () => {
    const p = toCanvasPoint({ x: 0.5, y: 0.5 }, t)
    expect(p.x).toBeCloseTo(200)
    expect(p.y).toBeCloseTo(150)
  })

  it('pushes the image edges past the canvas on the cropped axis', () => {
    expect(toCanvasPoint({ x: 0, y: 0 }, t).x).toBeLessThan(0)
    expect(toCanvasPoint({ x: 1, y: 1 }, t).x).toBeGreaterThan(400)
    expect(toCanvasPoint({ x: 1, y: 1 }, t).y).toBeCloseTo(300)
  })
})

describe('armLine', () => {
  const video = { width: 640, height: 480 }
  const canvas = { width: 320, height: 240 }

  it('returns null when no person is detected', () => {
    expect(armLine(null, video, canvas)).toBeNull()
  })

  it('returns null until the video has a size', () => {
    expect(armLine(pose({}), { width: 0, height: 0 }, canvas)).toBeNull()
  })

  it('returns null when landmarks are missing', () => {
    expect(armLine(pose({}).slice(0, 12), video, canvas)).toBeNull()
  })

  it('runs wrist → elbow → shoulder → shoulder → elbow → wrist, left to right', () => {
    // Mirrored T-pose: the player's left arm is on screen-left.
    const line = armLine(
      pose({
        [LANDMARK.LEFT_WRIST]: [0.1, 0.4],
        [LANDMARK.LEFT_ELBOW]: [0.25, 0.4],
        [LANDMARK.LEFT_SHOULDER]: [0.4, 0.4],
        [LANDMARK.RIGHT_SHOULDER]: [0.6, 0.4],
        [LANDMARK.RIGHT_ELBOW]: [0.75, 0.4],
        [LANDMARK.RIGHT_WRIST]: [0.9, 0.4],
      }),
      video,
      canvas,
    )
    expect(line?.map((p) => [p.x, p.y])).toEqual([
      [32, 96],
      [80, 96],
      [128, 96],
      [192, 96],
      [240, 96],
      [288, 96],
    ])
  })
})

const VIDEO = { width: 640, height: 480 }
const CANVAS = { width: 800, height: 600 }

describe('skeletonPoints', () => {
  it('returns null with no person', () => {
    expect(skeletonPoints(null, VIDEO, CANVAS)).toBeNull()
  })

  it('returns null before the canvas has a size', () => {
    expect(skeletonPoints(pose({}), VIDEO, { width: 0, height: 0 })).toBeNull()
  })

  it('places every joint through the cover transform and sizes the head from the shoulders', () => {
    const landmarks = pose({
      [LANDMARK.NOSE]: [0.5, 0.2],
      [LANDMARK.LEFT_SHOULDER]: [0.4, 0.4],
      [LANDMARK.RIGHT_SHOULDER]: [0.6, 0.4],
      [LANDMARK.LEFT_HIP]: [0.45, 0.7],
    })
    const skeleton = skeletonPoints(landmarks, VIDEO, CANVAS)
    expect(skeleton?.joints[JOINT.head]).toMatchObject({ x: 400, y: 120, visible: true })
    expect(skeleton?.joints[JOINT.leftShoulder]).toMatchObject({ x: 320, y: 240 })
    expect(skeleton?.joints[JOINT.leftHip]).toMatchObject({ x: 360, y: 420 })
    expect(skeleton?.headRadius).toBeCloseTo(160 * HEAD_RADIUS_PER_SHOULDER)
  })

  it('marks low-visibility joints invisible instead of dropping the skeleton', () => {
    const landmarks = pose({}).map((p, i) =>
      i === LANDMARK.LEFT_HIP ? { ...p, visibility: 0.2 } : p,
    )
    const skeleton = skeletonPoints(landmarks, VIDEO, CANVAS)
    expect(skeleton?.joints[JOINT.leftHip]?.visible).toBe(false)
    expect(skeleton?.joints[JOINT.leftWrist]?.visible).toBe(true)
  })

  it('reuses the output object', () => {
    const out = createSkeleton()
    expect(skeletonPoints(pose({}), VIDEO, CANVAS, out)).toBe(out)
  })

  it('draws every joint but the head as part of some bone', () => {
    const used = new Set(SKELETON_SEGMENTS.flatMap((s) => [s.from, s.to]))
    for (let i = 0; i < SKELETON_JOINTS.length; i++) {
      expect(used.has(i)).toBe(i !== JOINT.head)
    }
  })
})

describe('targetSkeleton', () => {
  it('is a level, symmetric T-pose centred in the frame', () => {
    const t = targetSkeleton(VIDEO, CANVAS)
    const j = (i: number) => t?.joints[i] ?? { x: NaN, y: NaN }
    const cx = CANVAS.width / 2
    for (const [l, r] of [
      [JOINT.leftShoulder, JOINT.rightShoulder],
      [JOINT.leftElbow, JOINT.rightElbow],
      [JOINT.leftWrist, JOINT.rightWrist],
      [JOINT.leftHip, JOINT.rightHip],
    ] as const) {
      expect(cx - j(l).x).toBeCloseTo(j(r).x - cx)
      expect(j(l).y).toBeCloseTo(j(r).y)
    }
    // Arms level with the shoulders, wrists outside elbows, head above, hips below.
    expect(j(JOINT.leftWrist).y).toBeCloseTo(j(JOINT.leftShoulder).y)
    expect(j(JOINT.leftWrist).x).toBeLessThan(j(JOINT.leftElbow).x)
    expect(j(JOINT.head).y).toBeLessThan(j(JOINT.leftShoulder).y)
    expect(j(JOINT.leftHip).y).toBeGreaterThan(j(JOINT.leftShoulder).y)
  })

  it('has a shoulder span inside the calibration distance range, so filling it passes the check', () => {
    // DEFAULT_CALIBRATION_PARAMS: 0.07..0.2 of frame width.
    expect(TARGET_POSE.shoulderWidth).toBeGreaterThan(0.07)
    expect(TARGET_POSE.shoulderWidth).toBeLessThan(0.2)
    const t = targetSkeleton(VIDEO, CANVAS)
    const span = (t?.joints[JOINT.rightShoulder]?.x ?? 0) - (t?.joints[JOINT.leftShoulder]?.x ?? 0)
    expect(span / CANVAS.width).toBeCloseTo(TARGET_POSE.shoulderWidth)
  })

  it('keeps the whole target inside the frame at its largest', () => {
    const t = targetSkeleton(VIDEO, CANVAS, 1 + TARGET_SCALE_SWING)
    for (const joint of t?.joints ?? []) {
      expect(joint.x).toBeGreaterThanOrEqual(0)
      expect(joint.x).toBeLessThanOrEqual(CANVAS.width)
      expect(joint.y).toBeGreaterThanOrEqual(0)
      expect(joint.y).toBeLessThanOrEqual(CANVAS.height)
    }
  })

  it('scales about the middle of the torso', () => {
    const mid = (s: number) => {
      const t = targetSkeleton(VIDEO, CANVAS, s)
      return ((t?.joints[JOINT.leftShoulder]?.y ?? 0) + (t?.joints[JOINT.leftHip]?.y ?? 0)) / 2
    }
    expect(mid(0.85)).toBeCloseTo(mid(1))
    expect(mid(1.15)).toBeCloseTo(mid(1))
    const width = (s: number) => {
      const t = targetSkeleton(VIDEO, CANVAS, s)
      return (t?.joints[JOINT.rightWrist]?.x ?? 0) - (t?.joints[JOINT.leftWrist]?.x ?? 0)
    }
    expect(width(0.5)).toBeCloseTo(width(1) / 2)
  })

  it('returns null with no canvas size', () => {
    expect(targetSkeleton(VIDEO, { width: 0, height: 0 })).toBeNull()
  })
})

describe('pulse', () => {
  it('rises from 0 to 1 at half a period and back', () => {
    expect(pulse(0)).toBeCloseTo(0)
    expect(pulse(PULSE_PERIOD_MS / 2)).toBeCloseTo(1)
    expect(pulse(PULSE_PERIOD_MS)).toBeCloseTo(0)
  })
})

describe('targetStyle', () => {
  const peak = PULSE_PERIOD_MS / 2

  it('pulses the whole target when nobody is in view', () => {
    const s = targetStyle('noPerson', peak, false)
    expect(s).toMatchObject({ bodyHighlight: true, armHighlight: true, scale: 1 })
    expect(s.highlightAlpha).toBeCloseTo(1)
    expect(targetStyle('noPerson', 0, false).highlightAlpha).toBeCloseTo(TARGET_ALPHA)
  })

  it('pulses only the arms when the arms are not out', () => {
    expect(targetStyle('armsNotOut', peak, false)).toMatchObject({
      bodyHighlight: false,
      armHighlight: true,
      scale: 1,
    })
  })

  it('shrinks the target when too close and grows it when too far', () => {
    expect(targetStyle('tooClose', peak, false).scale).toBeCloseTo(1 - TARGET_SCALE_SWING)
    expect(targetStyle('tooFar', peak, false).scale).toBeCloseTo(1 + TARGET_SCALE_SWING)
    expect(targetStyle('tooClose', 0, false).scale).toBeCloseTo(1)
  })

  it('holds steady while holding', () => {
    expect(targetStyle('holding', peak, false)).toMatchObject({
      bodyHighlight: false,
      armHighlight: false,
      scale: 1,
    })
  })

  it('holds the cue at its peak under reduced motion instead of pulsing', () => {
    for (const t of [0, 100, 777]) {
      expect(targetStyle('tooFar', t, true).scale).toBeCloseTo(1 + TARGET_SCALE_SWING)
      expect(targetStyle('armsNotOut', t, true).highlightAlpha).toBeCloseTo(1)
    }
  })
})
