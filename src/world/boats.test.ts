import { describe, expect, it } from 'vitest'
import { BOAT_CONFIG, FISHING_BEAM, planBoats, sailState, type SailingBoat } from './boatPlan'
import { heightAt } from './heightfield'
import { buildFishingBoat, buildBoats, buildSailboat } from './models/boats'
import { TERRAIN_CONFIG } from './terrainConfig'
import { getTown } from './town'

const town = getTown()
const boats = planBoats(town.layout)
const sailors = boats.filter((boat): boat is SailingBoat => boat.kind === 'sail')
const moored = boats.filter((boat) => boat.kind === 'fishing')
const tag = { loop: [0, 0, 0, 0], run: [0, 0, 0, 0] } as const
const triangles = (g: { getAttribute: (n: string) => { count: number } }) =>
  g.getAttribute('position').count / 3

/** m above the sea at a town-frame point: negative over water. */
const over = (x: number, z: number) => town.ground(x, z) - (TERRAIN_CONFIG.waterLevel - town.y)

describe('boat models', () => {
  it('stay under 400 triangles each', () => {
    expect(triangles(buildFishingBoat(9, 'roofSlate', tag))).toBeLessThanOrEqual(400)
    expect(triangles(buildSailboat(11, 'wallLime', tag))).toBeLessThanOrEqual(400)
  })

  it('merge into one geometry carrying the motion attributes', () => {
    const merged = buildBoats(boats)
    for (const name of ['boatLoop', 'boatRun', 'boatSail', 'glow', 'color']) {
      expect(merged.getAttribute(name), name).toBeDefined()
    }
    expect(merged.index).toBeNull()
  })

  it('face outward: every hull side normal points away from the keel line', () => {
    const geometry = buildFishingBoat(8, 'wallLime', tag)
    const p = geometry.getAttribute('position')
    const n = geometry.getAttribute('normal')
    let outward = 0
    for (let i = 0; i < p.count; i++) {
      const away = p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i)
      if (Math.abs(p.getX(i)) > 0.5 && away > 0) outward++
    }
    expect(outward).toBeGreaterThan(0)
  })
})

describe('boat plan', () => {
  it('has 4 fishing boats and 3 sailboats', () => {
    expect(moored).toHaveLength(4)
    expect(sailors).toHaveLength(3)
  })

  it('moors the fishing boats beside a finger pier, over water, clear of every deck', () => {
    for (const boat of moored) {
      if (boat.kind !== 'fishing') continue
      const finger = town.layout.fingers.find(
        (f) =>
          Math.abs(f.x - boat.x) < f.width / 2 + FISHING_BEAM / 2 + 1 &&
          boat.z > f.z0 &&
          boat.z < f.z1,
      )
      expect(finger, `boat at ${boat.x}, ${boat.z}`).toBeDefined()
      // Hull outline points (the bow, stern and beam) are afloat and off the piers.
      const sin = Math.sin(boat.yaw)
      const cos = Math.cos(boat.yaw)
      for (const [lx, lz] of [
        [0, -boat.length / 2],
        [0, boat.length / 2],
        [FISHING_BEAM / 2, 0],
        [-FISHING_BEAM / 2, 0],
        [0, 0],
      ] as const) {
        const x = boat.x + lx * cos + lz * sin
        const z = boat.z - lx * sin + lz * cos
        expect(over(x, z), 'afloat').toBeLessThan(-0.6)
        for (const f of town.layout.fingers) {
          const inside = Math.abs(x - f.x) < f.width / 2 + 0.1 && z > f.z0 - 0.1 && z < f.z1 + 0.1
          expect(inside, 'clear of finger').toBe(false)
        }
        const pier = town.layout.pier
        const onPier = x > pier.x0 && x < pier.x1 && Math.abs(z - pier.z) < pier.width / 2 + 0.1
        expect(onPier, 'clear of the main pier').toBe(false)
      }
    }
  })

  it('keeps the moored boats from touching each other', () => {
    for (let i = 0; i < moored.length; i++) {
      for (let j = i + 1; j < moored.length; j++) {
        const a = moored[i]
        const b = moored[j]
        if (a?.kind !== 'fishing' || b?.kind !== 'fishing') continue
        const clear =
          Math.abs(a.x - b.x) > FISHING_BEAM + 0.2 ||
          Math.abs(a.z - b.z) > (a.length + b.length) / 2 + 0.5
        expect(clear).toBe(true)
      }
    }
  })
})

describe('sailboat loops', () => {
  it('sail at 1 to 2 m/s the whole way round', () => {
    for (const { loop } of sailors) {
      const lap = 1 / Math.abs(loop.cycles)
      for (let i = 0; i < 64; i++) {
        const { speed } = sailState(loop, (i / 64) * lap)
        expect(speed).toBeGreaterThanOrEqual(BOAT_CONFIG.speed[0])
        expect(speed).toBeLessThanOrEqual(BOAT_CONFIG.speed[1])
      }
    }
  })

  it('close: a lap returns to the start', () => {
    for (const { loop } of sailors) {
      const a = sailState(loop, 0)
      const b = sailState(loop, 1 / Math.abs(loop.cycles))
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6)
    }
  })

  it('point the bow along the direction of travel', () => {
    for (const { loop } of sailors) {
      const a = sailState(loop, 100)
      const b = sailState(loop, 101)
      const bow = [-Math.sin(a.yaw), -Math.cos(a.yaw)]
      const move = [b.x - a.x, b.z - a.z]
      const dot = (bow[0]! * move[0]! + bow[1]! * move[1]!) / Math.hypot(move[0]!, move[1]!)
      expect(dot).toBeGreaterThan(0.99)
    }
  })

  it('stay within 3 km of the town and 60 m off any shore, islands included', () => {
    const margin = BOAT_CONFIG.shoreClearance + 10
    for (const { loop, length } of sailors) {
      const lap = 1 / Math.abs(loop.cycles)
      for (let i = 0; i < 180; i++) {
        const { x, z } = sailState(loop, (i / 180) * lap)
        expect(Math.hypot(x, z)).toBeLessThan(BOAT_CONFIG.townRadius)
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2
          for (const r of [0, margin - 10, margin + length / 2]) {
            const h = heightAt(
              town.x + x + Math.cos(a) * r,
              town.z + z + Math.sin(a) * r,
              TERRAIN_CONFIG,
            )
            expect(h, `loop point ${x | 0}, ${z | 0} + ${r} m`).toBeLessThan(
              TERRAIN_CONFIG.waterLevel - 0.5,
            )
          }
        }
      }
    }
  })

  it('keep the loops apart so two boats never meet', () => {
    for (let i = 0; i < sailors.length; i++) {
      for (let j = i + 1; j < sailors.length; j++) {
        const a = sailors[i]!.loop
        const b = sailors[j]!.loop
        let nearest = Infinity
        for (let p = 0; p < 240; p++) {
          const pa = sailState(a, p / 240 / Math.abs(a.cycles))
          for (let q = 0; q < 240; q++) {
            const pb = sailState(b, q / 240 / Math.abs(b.cycles))
            nearest = Math.min(nearest, Math.hypot(pa.x - pb.x, pa.z - pb.z))
          }
        }
        expect(nearest).toBeGreaterThan(60)
      }
    }
  })
})
