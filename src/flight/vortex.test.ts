import { describe, expect, it } from 'vitest'
import { PLANE_DIMENSIONS } from './planeGeometry'
import {
  VORTEX_PARAMS,
  buildRibbonIndex,
  clearVortexTrail,
  createVortexTrail,
  recordVortex,
  ribbonPoints,
  segmentDistance,
  vortexAlpha,
  vortexCapacity,
  vortexEmitting,
  wingtipLocal,
  writeRibbon,
} from './vortex'

const deg = (d: number) => (d * Math.PI) / 180

describe('vortexEmitting', () => {
  it('streams past 25° of bank either way, or past 52 m/s', () => {
    expect(vortexEmitting(deg(20), 45)).toBe(false)
    expect(vortexEmitting(deg(26), 45)).toBe(true)
    expect(vortexEmitting(deg(-26), 45)).toBe(true)
    expect(vortexEmitting(0, 52)).toBe(false)
    expect(vortexEmitting(0, 53)).toBe(true)
  })
})

describe('wingtipLocal', () => {
  it('sits at the tips, mirrored, above the wing root', () => {
    const [rx, ry] = wingtipLocal(1)
    const [lx, ly] = wingtipLocal(-1)
    expect(rx).toBeCloseTo(PLANE_DIMENSIONS.wingSpan / 2)
    expect(lx).toBeCloseTo(-rx)
    expect(ly).toBeCloseTo(ry)
    expect(ry).toBeGreaterThan(PLANE_DIMENSIONS.wingY)
  })
})

describe('trail', () => {
  it('holds a sample for every interval of its 1.5 s life', () => {
    expect(VORTEX_PARAMS.life).toBe(1.5)
    expect(vortexCapacity() * VORTEX_PARAMS.sampleInterval).toBeGreaterThanOrEqual(1.5)
  })

  it('records at most one sample per interval and wraps around', () => {
    const trail = createVortexTrail(4)
    recordVortex(trail, 1, 0, 0, 0, true)
    recordVortex(trail, 2, 0, 0, 0.001, true)
    expect(trail.count).toBe(1)
    for (let i = 1; i <= 6; i++) recordVortex(trail, i, 0, 0, i, true)
    expect(trail.count).toBe(4)
    expect(trail.position[trail.head * 3]).toBe(6)
    clearVortexTrail(trail)
    expect(trail.count).toBe(0)
  })
})

describe('vortexAlpha', () => {
  it('fades out over its life and is clear at the end', () => {
    expect(vortexAlpha(0, 30)).toBeCloseTo(VORTEX_PARAMS.opacity)
    expect(vortexAlpha(0.75, 30)).toBeLessThan(vortexAlpha(0.2, 30))
    expect(vortexAlpha(VORTEX_PARAMS.life, 30)).toBe(0)
  })

  it('fades out right in front of the camera', () => {
    expect(vortexAlpha(0, VORTEX_PARAMS.nearFadeStart)).toBe(0)
    expect(vortexAlpha(0, 10)).toBeGreaterThan(0)
    expect(vortexAlpha(0, 10)).toBeLessThan(vortexAlpha(0, VORTEX_PARAMS.nearFadeEnd))
  })
})

describe('writeRibbon', () => {
  function flyStraight(
    trail: ReturnType<typeof createVortexTrail>,
    emitting: (t: number) => boolean,
  ) {
    // 50 m/s toward -Z for 1 s.
    let t = 0
    for (; t <= 1; t += 1 / 60) recordVortex(trail, 5, 100, -50 * t, t, emitting(t))
    return t
  }

  it('spreads each point across the trail, facing a camera above and behind', () => {
    const trail = createVortexTrail()
    const now = flyStraight(trail, () => true)
    const points = ribbonPoints(trail.capacity)
    const positions = new Float32Array(points * 2 * 3)
    const colors = new Float32Array(points * 2 * 4).fill(1)
    writeRibbon(trail, 5, 100, -50 * now, true, now, 0, 110, -50 * now + 40, positions, colors, 0)
    // Point 3: the pair straddles the trail line, apart across X (the trail runs along Z and
    // the camera is up and behind, so the spread is sideways).
    const v = 3 * 2
    const dx = (positions[(v + 1) * 3] ?? 0) - (positions[v * 3] ?? 0)
    const dz = (positions[(v + 1) * 3 + 2] ?? 0) - (positions[v * 3 + 2] ?? 0)
    expect(Math.abs(dx)).toBeGreaterThan(0.1)
    expect(Math.abs(dz)).toBeLessThan(1e-3)
    expect(colors[v * 4 + 3]).toBeGreaterThan(0)
    // Nothing is ever NaN, and unused points collapse without stretching across the world.
    for (const value of positions) expect(Number.isFinite(value)).toBe(true)
  })

  it('leaves points recorded while not streaming clear', () => {
    const trail = createVortexTrail()
    const now = flyStraight(trail, (t) => t < 0.5)
    const points = ribbonPoints(trail.capacity)
    const positions = new Float32Array(points * 2 * 3)
    const colors = new Float32Array(points * 2 * 4)
    writeRibbon(trail, 5, 100, -50 * now, false, now, 0, 110, 40, positions, colors, 0)
    // The live tip and the newest samples (after streaming stopped) are clear; older ones show.
    expect(colors[3]).toBe(0)
    expect(colors[2 * 4 + 3]).toBe(0)
    const older = 20 * 2
    expect(colors[older * 4 + 3]).toBeGreaterThan(0)
  })

  it('never reaches back to samples from an earlier burst', () => {
    const trail = createVortexTrail()
    // A burst far away, long ago...
    for (let t = 0; t < 1; t += 1 / 30) recordVortex(trail, -5000, 100, -5000, t, true)
    // ...then a fresh one here, a few samples in.
    for (let t = 30; t < 30.2; t += 1 / 30) recordVortex(trail, 0, 100, -50 * (t - 30), t, true)
    const points = ribbonPoints(trail.capacity)
    const positions = new Float32Array(points * 2 * 3)
    const colors = new Float32Array(points * 2 * 4)
    writeRibbon(trail, 0, 100, -12, true, 30.25, 0, 110, 40, positions, colors, 0)
    for (let v = 0; v < points * 2; v++) {
      expect(Math.abs(positions[v * 3] ?? 0)).toBeLessThan(5)
      expect(Math.abs(positions[v * 3 + 2] ?? 0)).toBeLessThan(20)
    }
  })

  it('measures distance to a segment, not just its ends', () => {
    expect(segmentDistance(0, 0, 0, 10, 0, 0, 5, 3, 0)).toBeCloseTo(3)
    expect(segmentDistance(0, 0, 0, 10, 0, 0, -4, 3, 0)).toBeCloseTo(5)
    expect(segmentDistance(1, 1, 1, 1, 1, 1, 1, 1, 3)).toBeCloseTo(2)
  })

  it('ends the ribbon before it reaches the camera', () => {
    const trail = createVortexTrail()
    // Straight toward the camera parked at z = 10, from 1 s out.
    for (let t = 0; t <= 1; t += 1 / 30) recordVortex(trail, 0, 100, 10 - 50 * t, t, true)
    const points = ribbonPoints(trail.capacity)
    const positions = new Float32Array(points * 2 * 3)
    const colors = new Float32Array(points * 2 * 4)
    writeRibbon(trail, 0, 100, -41, true, 1.02, 0, 100.5, 10, positions, colors, 0)
    for (let v = 0; v < points * 2; v++) {
      const d = Math.hypot(
        positions[v * 3] ?? 0,
        (positions[v * 3 + 1] ?? 0) - 100.5,
        (positions[v * 3 + 2] ?? 0) - 10,
      )
      expect(d).toBeGreaterThan(VORTEX_PARAMS.nearFadeStart - 1)
    }
  })

  it('ends for good at the first dead point, even if older points look alive', () => {
    const trail = createVortexTrail()
    // Streaming, then a stretch not streaming, all within life.
    for (let t = 0; t < 0.6; t += 1 / 30) recordVortex(trail, 0, 100, -50 * t, t, true)
    const points = ribbonPoints(trail.capacity)
    const positions = new Float32Array(points * 2 * 3)
    const colors = new Float32Array(points * 2 * 4)
    // Camera parked right on the trail, 10 m back from the tip: the segment through it ends the
    // ribbon, and the older points beyond it must not reappear.
    writeRibbon(trail, 0, 100, -30, true, 0.6, 0, 100, -20, positions, colors, 0)
    let reachedPast = false
    for (let v = 0; v < points * 2; v++) if ((positions[v * 3 + 2] ?? 0) > -20) reachedPast = true
    expect(reachedPast).toBe(false)
  })

  it('ends when a long segment runs through the camera, both ends far from it', () => {
    const trail = createVortexTrail()
    // One sample 30 m back (a dropped frame), camera halfway along the segment, 1 m off it.
    recordVortex(trail, 0, 100, 0, 0, true)
    const points = ribbonPoints(trail.capacity)
    const positions = new Float32Array(points * 2 * 3)
    const colors = new Float32Array(points * 2 * 4)
    writeRibbon(trail, 0, 100, -30, true, 0.5, 1, 100, -15, positions, colors, 0)
    for (let v = 0; v < points * 2; v++) expect(positions[v * 3 + 2]).toBeCloseTo(-30, 0)
  })

  it('draws nothing from an empty trail', () => {
    const trail = createVortexTrail()
    const points = ribbonPoints(trail.capacity)
    const positions = new Float32Array(points * 2 * 3)
    const colors = new Float32Array(points * 2 * 4).fill(1)
    writeRibbon(trail, 1, 2, 3, false, 0, 0, 10, 20, positions, colors, 0)
    for (let v = 0; v < points * 2; v++) expect(colors[v * 4 + 3]).toBe(0)
  })
})

describe('buildRibbonIndex', () => {
  it('draws a quad between neighbouring points and none between ribbons', () => {
    const points = 5
    const index = buildRibbonIndex(2, points)
    expect(index.length).toBe(2 * (points - 1) * 6)
    // The first quad of the second ribbon starts at its own first vertex.
    const firstOfSecond = (points - 1) * 6
    expect(index[firstOfSecond]).toBe(points * 2)
    const maxVertex = Math.max(...index)
    expect(maxVertex).toBe(2 * points * 2 - 1)
  })
})
