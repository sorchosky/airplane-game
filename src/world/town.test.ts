import { type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { color } from '../styles/tokens'
import { windowGlowAmount } from './landmarkMaterials'
import { allFoliageExclusions } from './foliageExclusions'
import { buildTown, tallestRidge } from './models/town'
import { getTown } from './town'
import { ridgeHeight } from './townLayout'
import { heightAt } from './heightfield'
import { TERRAIN_CONFIG } from './terrainConfig'

const town = getTown()
const { layout, ground } = town
const geometry = buildTown(layout, ground)
const deg = (radians: number) => (radians * 180) / Math.PI

function triangles(g: BufferGeometry): number {
  return g.getAttribute('position').count / 3
}

/** Lowest vertex within `radius` m (in x, z) of a point, or Infinity. */
function lowestNear(g: BufferGeometry, x: number, z: number, radius: number): number {
  const p = g.getAttribute('position')
  let low = Infinity
  for (let i = 0; i < p.count; i++) {
    if (Math.hypot(p.getX(i) - x, p.getZ(i) - z) <= radius) low = Math.min(low, p.getY(i))
  }
  return low
}

function lightness(hex: string): { luminance: number; lstar: number; saturation: number } {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  const lstar = luminance > 0.008856 ? 116 * luminance ** (1 / 3) - 16 : 903.3 * luminance
  const hi = Math.max(...channels)
  const lo = Math.min(...channels)
  const l = (hi + lo) / 2
  return { luminance, lstar, saturation: hi === lo ? 0 : (hi - lo) / (1 - Math.abs(2 * l - 1)) }
}

const contrast = (a: string, b: string): number => {
  const [x, y] = [lightness(a).luminance, lightness(b).luminance]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe('fishing town plan', () => {
  it('has 8 to 12 houses from 3 variants, half with chimneys', () => {
    const { houses } = layout
    expect(houses.length).toBeGreaterThanOrEqual(8)
    expect(houses.length).toBeLessThanOrEqual(12)
    expect(new Set(houses.map((h) => h.variant))).toEqual(
      new Set(['cottage', 'twoStorey', 'boathouse']),
    )
    const chimneys = houses.filter((h) => h.chimney).length
    expect(chimneys / houses.length).toBeGreaterThanOrEqual(0.4)
    expect(chimneys / houses.length).toBeLessThanOrEqual(0.6)
  })

  it('pitches every roof 40 to 50° and varies size and roof colour', () => {
    for (const h of layout.houses) {
      expect(deg(h.pitch)).toBeGreaterThanOrEqual(40)
      expect(deg(h.pitch)).toBeLessThanOrEqual(50)
    }
    expect(new Set(layout.houses.map((h) => h.roof)).size).toBe(2)
    expect(new Set(layout.houses.map((h) => h.length.toFixed(1))).size).toBeGreaterThan(5)
  })

  it('turns each house within 8° of the lane it faces along, on curved lanes, not a grid', () => {
    for (const h of layout.houses) {
      const s = (layout.shoreAt(h.z + 5) - layout.shoreAt(h.z - 5)) / 10
      const inv = 1 / Math.hypot(1, s)
      // The lane's normal points to the sea; the front is local +z, or +x for the water door.
      const front =
        h.variant === 'boathouse'
          ? [Math.cos(h.yaw), -Math.sin(h.yaw)]
          : [Math.sin(h.yaw), Math.cos(h.yaw)]
      const off = Math.acos(Math.min(1, front[0]! * inv + front[1]! * -s * inv))
      expect(deg(off)).toBeLessThanOrEqual(8.01)
    }
    const xs = layout.houses.filter((h) => h.variant !== 'boathouse').map((h) => h.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(20)
  })

  it('stands a lighthouse at least 3× the tallest ridge, on the shore nearest the route', () => {
    expect(layout.lighthouse.height).toBeGreaterThanOrEqual(3 * tallestRidge(layout))
    geometry.computeBoundingBox()
    expect(
      geometry.boundingBox!.max.y - ground(layout.lighthouse.x, layout.lighthouse.z),
    ).toBeCloseTo(layout.lighthouse.height, 0)
    // No shore point in the town's reach lies nearer the route (west) than the lighthouse's.
    const nearest = Math.min(...[-100, -50, 0, 50, 100, 150].map((z) => layout.shoreAt(z)))
    expect(layout.shoreAt(layout.lighthouse.z)).toBeLessThanOrEqual(nearest + 1)
  })

  it('runs a main pier 60 to 90 m with one or two fingers, and props', () => {
    const { pier, fingers } = layout
    expect(pier.x1 - pier.x0).toBeGreaterThanOrEqual(60)
    expect(pier.x1 - pier.x0).toBeLessThanOrEqual(90)
    expect(fingers.length).toBeGreaterThanOrEqual(1)
    expect(fingers.length).toBeLessThanOrEqual(2)
    expect(layout.crates.length).toBeGreaterThanOrEqual(3)
    expect(layout.barrels.length).toBeGreaterThanOrEqual(2)
  })
})

describe('fishing town model', () => {
  it('stays within 6,000 triangles, and is mergeable with the landmarks', () => {
    expect(triangles(geometry)).toBeLessThanOrEqual(6000)
    expect(geometry.index).toBeNull()
    for (const name of ['position', 'normal', 'color', 'glow']) {
      expect(geometry.getAttribute(name).count).toBe(geometry.getAttribute('position').count)
    }
  })

  it('sets every piling on the sea bed under it, via the ground', () => {
    const { pier } = layout
    const half = pier.width / 2
    for (let x = pier.x0 + 2; x <= pier.x1 - 7; x += 5) {
      for (const z of [pier.z - half + 0.35, pier.z + half - 0.35]) {
        expect(lowestNear(geometry, x, z, 0.5)).toBeLessThanOrEqual(ground(x, z) - 0.5)
      }
    }
    // The pier really is over water, with a bed well under the deck.
    expect(ground(pier.x1, pier.z)).toBeLessThan(pier.deckHeight - 4)
  })

  it('leaves no floating corners: every house reaches the ground under each corner', () => {
    for (const h of layout.houses) {
      const cos = Math.cos(h.yaw)
      const sin = Math.sin(h.yaw)
      for (const [u, v] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ] as const) {
        const x = h.x + u * h.length * cos + v * h.width * sin
        const z = h.z - u * h.length * sin + v * h.width * cos
        expect(
          lowestNear(geometry, x, z, 0.6),
          `${h.variant} at ${h.x},${h.z}`,
        ).toBeLessThanOrEqual(ground(x, z) + 0.05)
      }
    }
  })

  it('sits on the shore pad: flat ground under the houses', () => {
    for (const h of layout.houses.filter((house) => house.variant !== 'boathouse')) {
      expect(Math.abs(ground(h.x, h.z))).toBeLessThan(3)
      expect(ridgeHeight(h)).toBeLessThan(layout.lighthouse.height / 3)
    }
    expect(heightAt(town.x, town.z, TERRAIN_CONFIG)).toBeCloseTo(town.y, 6)
  })

  it('keeps foliage out of every building', () => {
    const zones = allFoliageExclusions()
    const covered = (x: number, z: number) =>
      zones.some((zone) => Math.hypot(x + town.x - zone.x, z + town.z - zone.z) < zone.radius)
    for (const h of layout.houses) expect(covered(h.x, h.z)).toBe(true)
    expect(covered(layout.lighthouse.x, layout.lighthouse.z)).toBe(true)
    expect(covered(layout.rack.x, layout.rack.z)).toBe(true)
  })

  it('masks the windows and lantern for the night glow, and nothing else', () => {
    const glow = geometry.getAttribute('glow')
    let lit = 0
    for (let i = 0; i < glow.count; i++) {
      expect([0, 1]).toContain(glow.getX(i))
      if (glow.getX(i) === 1) lit++
    }
    expect(lit).toBeGreaterThan(0)
    expect(lit / glow.count).toBeLessThan(0.3)
  })
})

describe('window glow', () => {
  it('is off by morning, on at the dusk key and at night', () => {
    expect(windowGlowAmount(0)).toBe(0)
    expect(windowGlowAmount(0.35)).toBe(1)
    expect(windowGlowAmount(1)).toBe(1)
    expect(windowGlowAmount(0.2)).toBeGreaterThan(0)
    expect(windowGlowAmount(0.2)).toBeLessThan(1)
  })
})

describe('town palette (art bible §2)', () => {
  it('holds the value targets: whitewash under the cloud tops and the plane, roofs mid, pier grey', () => {
    expect(lightness(color.wallLime).lstar).toBeGreaterThanOrEqual(86)
    expect(lightness(color.wallLime).lstar).toBeLessThan(lightness(color.planeBody).lstar)
    expect(lightness(color.timber).lstar).toBeGreaterThanOrEqual(22)
    expect(lightness(color.timber).lstar).toBeLessThan(40)
    for (const roof of [color.roofTerracotta, color.roofSlate]) {
      expect(lightness(roof).lstar).toBeGreaterThanOrEqual(40)
      expect(lightness(roof).lstar).toBeLessThanOrEqual(60)
    }
    expect(lightness(color.pierGrey).lstar).toBeGreaterThanOrEqual(52)
    expect(lightness(color.pierGrey).lstar).toBeLessThanOrEqual(65)
    expect(lightness(color.pierGrey).saturation).toBeLessThan(0.1)
  })

  it('keeps the outline at 3:1 or better against the water and the grass', () => {
    for (const ground of [color.waterShallow, color.grassLight, color.grassShadow]) {
      expect(contrast(color.outline, ground)).toBeGreaterThanOrEqual(3)
    }
  })
})
