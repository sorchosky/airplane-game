import { describe, expect, it } from 'vitest'
import { applyBasin, crestAt, floorAt, notchRadius } from './basin'
import { heightAt } from './heightfield'
import { ROUTE_POINTS } from './routePoints'
import { TERRAIN_CONFIG } from './terrainConfig'

const config = TERRAIN_CONFIG
const basin = config.basin
const [cut, returnNotch] = basin.notches
// The return notch holds the route river's lake (#174) on purpose. The notch tests check the floor
// under it.
const noLake = {
  ...config,
  river: { ...config.river, lake: { ...config.river.lake, innerRadius: 0, outerRadius: 0 } },
}

const at = (r: number, theta: number): [number, number] => [
  basin.centerX + r * Math.sin(theta),
  basin.centerZ - r * Math.cos(theta),
]
const bearingOf = (n: { x: number; z: number }): number =>
  Math.atan2(n.x - basin.centerX, -(n.z - basin.centerZ))
const angularGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2)
  return Math.min(d, Math.PI * 2 - d)
}

describe('applyBasin', () => {
  it('leaves the terrain alone far from the basin', () => {
    expect(applyBasin(basin.centerX + 6000, basin.centerZ, 123, basin)).toBe(123)
    expect(applyBasin(basin.centerX, basin.centerZ - 6000, 77, basin)).toBe(77)
  })

  it('sets a gently sloped floor inside the clear radius', () => {
    const centre = heightAt(basin.centerX, basin.centerZ, config)
    expect(Math.abs(centre - basin.floorCenterHeight)).toBeLessThan(basin.floorNoise + 0.5)
    for (let theta = 0; theta < Math.PI * 2; theta += 0.5) {
      const [x, z] = at(basin.clearRadius * 0.6, theta)
      const h = heightAt(x, z, config)
      const expected = floorAt(basin.clearRadius * 0.6, basin)
      // Skip the notch corridors, which blend toward their own floors.
      if (
        angularGap(theta, bearingOf(cut)) < 0.4 ||
        angularGap(theta, bearingOf(returnNotch)) < 0.4
      )
        continue
      expect(Math.abs(h - expected)).toBeLessThan(basin.floorNoise + 0.5)
    }
  })

  it('keeps the ridge crest in its height band all round except at the notches', () => {
    const notchBearings = basin.notches.map(bearingOf)
    let tallest = 0
    for (let deg = 0; deg < 360; deg += 3) {
      const theta = (deg * Math.PI) / 180
      if (notchBearings.some((b) => angularGap(theta, b) < 0.5)) continue
      let crest = 0
      for (let r = basin.ridgeRadius - 40; r <= basin.ridgeRadius + 40; r += 20) {
        const [x, z] = at(r, theta)
        crest = Math.max(crest, heightAt(x, z, config))
      }
      const designed = crestAt(theta, basin)
      expect(crest).toBeGreaterThan(designed - basin.ridgeNoise - 1)
      expect(crest).toBeLessThan(designed + basin.ridgeNoise + 1)
      tallest = Math.max(tallest, crest)
    }
    // Clearable at cruise: well under the 600 m flight ceiling.
    expect(tallest).toBeLessThan(350)
  })

  it('is not a perfect circle: the crest varies round the ring', () => {
    const crests = Array.from({ length: 36 }, (_, i) => crestAt((i / 36) * Math.PI * 2, basin))
    expect(Math.max(...crests) - Math.min(...crests)).toBeGreaterThan(basin.crestHeight * 0.1)
  })

  it.each([
    ['cut', cut],
    ['return notch', returnNotch],
  ] as const)('puts the %s floor at its designed height and width', (_name, notch) => {
    expect(heightAt(notch.x, notch.z, noLake)).toBeCloseTo(notch.floorHeight, 6)
    const nr = notchRadius(basin, notch)
    const theta = bearingOf(notch)
    // Across the whole floor width at the route point. The route valley (#172) starts its join
    // here, so off the centre line its floor detail may lift the floor a little.
    for (const offset of [-notch.halfWidth, 0, notch.halfWidth]) {
      const [x, z] = at(nr, theta)
      const lateralX = Math.cos(theta) * offset
      const lateralZ = Math.sin(theta) * offset
      const h = heightAt(x + lateralX, z + lateralZ, noLake)
      expect(h).toBeGreaterThan(notch.floorHeight - 0.5)
      expect(h).toBeLessThan(notch.floorHeight + config.valley.floorNoise)
    }
    // And the walls rise: well above the floor one flank away.
    const [wx, wz] = at(basin.ridgeRadius, theta)
    const wallX = wx + Math.cos(theta) * (notch.halfWidth + notch.flank)
    const wallZ = wz + Math.sin(theta) * (notch.halfWidth + notch.flank)
    expect(heightAt(wallX, wallZ, config)).toBeGreaterThan(notch.floorHeight + 100)
  })

  it('makes the cut at least 250 m wide and face the spawn heading', () => {
    expect(cut.halfWidth * 2).toBeGreaterThanOrEqual(250)
    expect(bearingOf(cut)).toBeCloseTo(0.245, 2)
  })

  it('matches the approved route control points', () => {
    const near = (p: { x: number; z: number }, n: { x: number; z: number }) =>
      p.x === n.x && p.z === n.z
    expect(ROUTE_POINTS.some((p) => near(p, cut))).toBe(true)
    expect(ROUTE_POINTS.some((p) => near(p, returnNotch))).toBe(true)
    expect(ROUTE_POINTS[0]).toMatchObject({ x: basin.centerX, z: basin.centerZ })
  })

  it('has no cliffs across the blend zone (gradient bound)', () => {
    const step = 10
    let worst = 0
    for (let deg = 0; deg < 360; deg += 5) {
      const theta = (deg * Math.PI) / 180
      let previous = applyBasin(...at(0, theta), 150, basin)
      for (let r = step; r <= basin.blendRadius + 300; r += step) {
        const [x, z] = at(r, theta)
        const h = applyBasin(x, z, 150, basin)
        worst = Math.max(worst, Math.abs(h - previous) / step)
        previous = h
      }
    }
    // 1.5 is about 56 degrees; the steepest designed wall is under 1.
    expect(worst).toBeLessThan(1.5)
  })
})
