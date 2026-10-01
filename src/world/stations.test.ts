import { describe, expect, it } from 'vitest'
import { heightAt } from './heightfield'
import { ROUTE } from './route'
import { LANDMARK_STATIONS } from './routePoints'
import {
  applyPlungePool,
  bearingTo,
  bearingVector,
  plungePoolCenter,
  stationFor,
  stationPosition,
  waterfallYaw,
} from './stations'
import { TERRAIN_CONFIG } from './terrainConfig'

const pool = TERRAIN_CONFIG.plungePool

describe('stationPosition', () => {
  it('offsets along the route normal with the sign of `nearest().lateral`', () => {
    for (const station of LANDMARK_STATIONS) {
      const { x, z } = stationPosition(station)
      const nearest = ROUTE.nearest(x, z)
      expect(nearest.lateral).toBeCloseTo(station.lateral, 0)
      expect(nearest.s).toBeCloseTo(station.s, -1)
    }
  })

  it('has one station per kind', () => {
    const kinds = new Set(LANDMARK_STATIONS.map((station) => station.kind))
    expect(kinds.size).toBe(LANDMARK_STATIONS.length)
    expect(stationFor('arch').lateral).toBe(0)
  })
})

describe('bearings', () => {
  it('round-trips a bearing through its vector', () => {
    const [fx, fz] = bearingVector(0.7)
    expect(bearingTo(0, 0, fx, fz)).toBeCloseTo(0.7, 12)
  })
})

describe('plunge pool', () => {
  const center = plungePoolCenter(pool)
  const bed = TERRAIN_CONFIG.waterLevel - pool.depth

  it('sits in front of the waterfall, toward the route', () => {
    const origin = stationPosition(stationFor('waterfall'))
    const [fx, fz] = bearingVector(waterfallYaw())
    expect(center.x - origin.x).toBeCloseTo(fx * pool.centerDistance, 9)
    expect(center.z - origin.z).toBeCloseTo(fz * pool.centerDistance, 9)
    expect(Math.abs(ROUTE.nearest(center.x, center.z).lateral)).toBeLessThan(
      Math.abs(stationFor('waterfall').lateral),
    )
  })

  it('digs the bed under the water inside the inner radius', () => {
    expect(heightAt(center.x, center.z, TERRAIN_CONFIG)).toBe(bed)
    expect(heightAt(center.x + pool.innerRadius - 1, center.z, TERRAIN_CONFIG)).toBe(bed)
  })

  it('leaves the ground alone outside the outer radius, and never raises it', () => {
    expect(applyPlungePool(center.x + pool.outerRadius, center.z, 40, TERRAIN_CONFIG)).toBe(40)
    expect(applyPlungePool(center.x, center.z, bed - 5, TERRAIN_CONFIG)).toBe(bed - 5)
    for (let r = 0; r <= pool.outerRadius; r += 5) {
      expect(applyPlungePool(center.x + r, center.z, 40, TERRAIN_CONFIG)).toBeLessThanOrEqual(40)
    }
  })

  it('eases the bank continuously from bed to ground', () => {
    let last = bed
    for (let r = pool.innerRadius; r <= pool.outerRadius; r += 1) {
      const h = applyPlungePool(center.x + r, center.z, 40, TERRAIN_CONFIG)
      expect(h).toBeGreaterThanOrEqual(last)
      expect(h - last).toBeLessThan(1.2)
      last = h
    }
    expect(last).toBeCloseTo(40, 6)
  })
})
