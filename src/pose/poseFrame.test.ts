import { describe, expect, it } from 'vitest'
import {
  createDetectionStats,
  DETECTION_INTERVAL_MS,
  mirrorLandmarks,
  mirrorWorldLandmarks,
  pace,
  recordDetection,
  toPoseFrame,
} from './poseFrame'

const point = (x: number, y = 0.5, visibility?: number) => ({ x, y, z: 0.1, visibility })

describe('mirrorLandmarks', () => {
  it('flips normalized x and keeps y, z and visibility', () => {
    expect(mirrorLandmarks([point(0.2, 0.3, 0.9)])).toEqual([
      { x: 0.8, y: 0.3, z: 0.1, visibility: 0.9 },
    ])
  })

  it('treats missing visibility as 0', () => {
    expect(mirrorLandmarks([point(0.5)])[0]?.visibility).toBe(0)
  })
})

describe('mirrorWorldLandmarks', () => {
  it('negates world x around the hip origin', () => {
    expect(mirrorWorldLandmarks([point(0.25, -0.4, 1)])[0]).toEqual({
      x: -0.25,
      y: -0.4,
      z: 0.1,
      visibility: 1,
    })
  })
})

describe('toPoseFrame', () => {
  it('returns null when no person was detected', () => {
    expect(toPoseFrame({ landmarks: [], worldLandmarks: [] }, 100)).toBeNull()
  })

  it('mirrors the first pose and stamps the detection time', () => {
    const frame = toPoseFrame({ landmarks: [[point(0.1)]], worldLandmarks: [[point(0.3)]] }, 42)
    expect(frame?.timestampMs).toBe(42)
    expect(frame?.landmarks[0]?.x).toBeCloseTo(0.9)
    expect(frame?.worldLandmarks[0]?.x).toBeCloseTo(-0.3)
  })

  it('keeps the player-left landmark on screen-left after mirroring', () => {
    // Raw camera image: the player's left shoulder (11) appears on the image's right.
    const raw = Array.from({ length: 33 }, () => point(0.5))
    raw[11] = point(0.6)
    raw[12] = point(0.4)
    const frame = toPoseFrame({ landmarks: [raw], worldLandmarks: [raw] }, 0)
    expect(frame?.landmarks[11]?.x).toBeLessThan(frame?.landmarks[12]?.x ?? 0)
  })
})

describe('pace', () => {
  it('averages the target rate from a 30 fps camera instead of rounding down', () => {
    let dueMs = 0
    let runs = 0
    const frameMs = 1000 / 30
    for (let i = 0; i < 300; i++) {
      const result = pace(i * frameMs, dueMs)
      dueMs = result.dueMs
      if (result.run) runs++
    }
    // 10 s of camera frames → ~200 detections at 20 Hz.
    expect(runs).toBeGreaterThanOrEqual(199)
    expect(runs).toBeLessThanOrEqual(201)
  })

  it('does not run before the next slot is due', () => {
    expect(pace(10, 50)).toEqual({ run: false, dueMs: 50 })
  })

  it('resets instead of bursting after a long gap', () => {
    const result = pace(5000, 50)
    expect(result).toEqual({ run: true, dueMs: 5000 + DETECTION_INTERVAL_MS })
  })
})

describe('recordDetection', () => {
  it('reports Hz once a full window has elapsed', () => {
    let stats = createDetectionStats()
    for (let t = 0; t <= 1000; t += 50) stats = recordDetection(stats, t, 10)
    expect(stats.hz).toBeCloseTo(20)
  })

  it('reports 0 Hz before the first window completes', () => {
    let stats = createDetectionStats()
    stats = recordDetection(stats, 0, 10)
    stats = recordDetection(stats, 50, 10)
    expect(stats.hz).toBe(0)
  })

  it('seeds inference time from the first sample, then smooths', () => {
    let stats = recordDetection(createDetectionStats(), 0, 20)
    expect(stats.inferenceMs).toBe(20)
    stats = recordDetection(stats, 50, 10)
    expect(stats.inferenceMs).toBeGreaterThan(10)
    expect(stats.inferenceMs).toBeLessThan(20)
  })
})
