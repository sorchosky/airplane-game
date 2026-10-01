import { describe, expect, it } from 'vitest'
import { createRoute, ROUTE } from './route'
import { ROUTE_POINTS } from './routePoints'
import { TERRAIN_CONFIG } from './terrainConfig'

describe('route', () => {
  it('is continuous where it closes', () => {
    expect(ROUTE.pointAt(0)).toEqual(ROUTE.pointAt(ROUTE.length))
    expect(ROUTE.tangentAt(0)).toEqual(ROUTE.tangentAt(ROUTE.length))
    expect(ROUTE.length).toBeGreaterThanOrEqual(12_500)
    expect(ROUTE.length).toBeLessThanOrEqual(14_500)
  })

  it('keeps the authored valley within its design envelope', () => {
    for (const point of ROUTE_POINTS) {
      expect(point.valleyWidth).toBeGreaterThanOrEqual(300)
      expect(point.valleyWidth).toBeLessThanOrEqual(600)
    }
    expect(ROUTE_POINTS[0]).toMatchObject({ x: 1750, z: 2000 })
  })

  it('aims the spawn through a navigable outbound cut', () => {
    const spawn = ROUTE_POINTS[0]!
    const cut = ROUTE_POINTS[1]!
    const heading = -0.245
    const distance = Math.hypot(cut.x - spawn.x, cut.z - spawn.z)
    const forward = { x: -Math.sin(heading), z: -Math.cos(heading) }
    const alignment = ((cut.x - spawn.x) * forward.x + (cut.z - spawn.z) * forward.z) / distance

    expect(alignment).toBeGreaterThan(0.999)
    expect(cut.valleyWidth).toBeGreaterThanOrEqual(250)
  })

  it('marks four low control points for river stretches', () => {
    const riverPoints = ROUTE_POINTS.filter(
      ({ floorHeight }) => floorHeight <= TERRAIN_CONFIG.waterLevel + 4,
    )

    expect(riverPoints).toHaveLength(4)
    expect(riverPoints.every(({ floorHeight }) => floorHeight >= TERRAIN_CONFIG.waterLevel)).toBe(
      true,
    )
  })

  it('is parameterized uniformly by arc length', () => {
    const steps = 200
    const distances: number[] = []
    for (let i = 0; i < steps; i++) {
      const a = ROUTE.pointAt((i * ROUTE.length) / steps)
      const b = ROUTE.pointAt(((i + 1) * ROUTE.length) / steps)
      distances.push(Math.hypot(b.x - a.x, b.z - a.z))
    }
    const average = distances.reduce((sum, distance) => sum + distance, 0) / steps
    expect(
      Math.max(...distances.map((distance) => Math.abs(distance - average))) / average,
    ).toBeLessThan(0.01)
  })

  it('matches a dense brute-force nearest search within one metre', () => {
    for (let i = 0; i < 100; i++) {
      const source = ROUTE.pointAt((i * ROUTE.length) / 100)
      const x = source.x + Math.sin(i * 19) * 500
      const z = source.z + Math.cos(i * 23) * 500
      const nearest = ROUTE.nearest(x, z)
      let bruteDistance = Infinity
      for (let j = 0; j < 50_000; j++) {
        const s = (j * ROUTE.length) / 50_000
        const point = ROUTE.pointAt(s)
        const distance = Math.hypot(x - point.x, z - point.z)
        if (distance < bruteDistance) {
          bruteDistance = distance
        }
      }
      expect(Math.abs(Math.abs(nearest.lateral) - bruteDistance)).toBeLessThan(1)
    }
  })

  it('uses a consistent signed side', () => {
    const square = createRoute([
      { x: 0, z: 0, floorHeight: 10, valleyWidth: 100 },
      { x: 100, z: 0, floorHeight: 20, valleyWidth: 200 },
      { x: 100, z: 100, floorHeight: 30, valleyWidth: 300 },
      { x: 0, z: 100, floorHeight: 40, valleyWidth: 400 },
    ])
    const s = square.length * 0.1
    const point = square.pointAt(s)
    const tangent = square.tangentAt(s)
    expect(
      square.nearest(point.x - tangent.z * 10, point.z + tangent.x * 10).lateral,
    ).toBeGreaterThan(0)
    expect(square.nearest(point.x + tangent.z * 10, point.z - tangent.x * 10).lateral).toBeLessThan(
      0,
    )
    expect(square.nearest(point.x, point.z).floorHeight).toBeGreaterThan(10)
    expect(square.nearest(point.x, point.z).valleyWidth).toBeGreaterThan(100)
  })

  it('answers 100k nearby queries in under 50 ms', () => {
    const queries = Array.from({ length: 256 }, (_, i) => {
      const point = ROUTE.pointAt((i * ROUTE.length) / 256)
      return {
        x: point.x + Math.sin(i * 19) * 24,
        z: point.z + Math.cos(i * 23) * 24,
      }
    })
    let checksum = 0
    // Exclude one-time JIT compilation from the steady-state query benchmark.
    for (let i = 0; i < 10_000; i++) {
      const query = queries[i & 255]!
      checksum += ROUTE.nearest(query.x, query.z).s
    }
    let elapsed = Infinity
    for (let run = 0; run < 3; run++) {
      const start = performance.now()
      for (let i = 0; i < 100_000; i++) {
        const query = queries[i & 255]!
        checksum += ROUTE.nearest(query.x, query.z).s
      }
      elapsed = Math.min(elapsed, performance.now() - start)
    }
    expect(checksum).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(50)
  })
})
