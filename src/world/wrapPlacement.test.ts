import { describe, expect, it } from 'vitest'
import { GRID_REACH, ROUTE } from './route'
import { lakeSpot } from './routeRiver'
import { LANDMARK_STATIONS } from './routePoints'
import { plungePoolCenter, stationPosition } from './stations'
import { TERRAIN_CONFIG } from './terrainConfig'

// #176: the designed features sit inside the one period centred on the basin, far enough in that
// everything they shape stays clear of the wrap edge half a period out.
const config = TERRAIN_CONFIG
const P = config.worldPeriod
const { centerX, centerZ } = config.basin

function inside(x: number, z: number, reach: number) {
  expect(Math.abs(x - centerX) + reach).toBeLessThan(P / 2)
  expect(Math.abs(z - centerZ) + reach).toBeLessThan(P / 2)
}

describe('designed features inside one period', () => {
  it('the basin, with everything it blends', () => {
    inside(centerX, centerZ, config.basin.blendRadius)
    for (const notch of config.basin.notches) {
      inside(notch.x, notch.z, config.basin.blendRadius + notch.extension)
    }
  })

  it('the route valley and river, out to the furthest the terrain carves', () => {
    for (let s = 0; s < ROUTE.length; s += 20) {
      const p = ROUTE.pointAt(s)
      inside(p.x, p.z, GRID_REACH)
    }
    const lake = lakeSpot(config)
    inside(lake.x, lake.z, config.river.lake.outerRadius)
  })

  it('the landmark stations and the plunge pool', () => {
    for (const station of LANDMARK_STATIONS) {
      const p = stationPosition(station)
      inside(p.x, p.z, 500)
    }
    const pool = plungePoolCenter(config.plungePool)
    inside(pool.x, pool.z, config.plungePool.outerRadius)
  })
})

describe('minimum-image route queries', () => {
  it('answer the same from any copy of a point', () => {
    for (let i = 0; i < 60; i++) {
      const p = ROUTE.pointAt((i * ROUTE.length) / 60)
      const x = p.x + Math.sin(i * 7) * 400
      const z = p.z + Math.cos(i * 7) * 400
      const here = ROUTE.nearest(x, z, 640)!
      for (const [dx, dz] of [
        [P, -P],
        [-3 * P, 0],
      ] as const) {
        const copy = ROUTE.nearest(x + dx, z + dz, 640)!
        expect(copy.s).toBeCloseTo(here.s, 6)
        expect(copy.lateral).toBeCloseTo(here.lateral, 6)
      }
      const rival = ROUTE.rival(x, z, 60)
      const rivalCopy = ROUTE.rival(x + P, z, 60)
      expect(rivalCopy === null).toBe(rival === null)
      if (rival && rivalCopy) expect(rivalCopy.s).toBeCloseTo(rival.s, 6)
    }
  })

  it('measure distance to the nearest copy of the route', () => {
    const p = ROUTE.pointAt(5000)
    expect(Math.abs(ROUTE.nearest(p.x + P, p.z).lateral)).toBeLessThan(1)
  })
})
