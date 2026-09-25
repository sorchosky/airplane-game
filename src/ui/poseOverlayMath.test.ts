import { describe, expect, it } from 'vitest'
import { LANDMARK, LANDMARK_COUNT } from '../pose/landmarks'
import type { PoseLandmark } from '../pose/types'
import { armLine, coverTransform, toCanvasPoint } from './poseOverlayMath'

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
