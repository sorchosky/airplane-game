import { describe, expect, it } from 'vitest'
import { POST_FX } from '../render/postFx'
import { lightingPresets } from '../styles/tokens'
import { hexToLinear, SUN_DIRECTION } from './atmosphere'
import {
  buildHeapGeometry,
  CLOUD_BURST,
  CLOUD_GATE_HEAPS,
  CLOUD_LIT_GAIN,
  CLOUD_SHADE_GAIN,
  cloudBand,
  cloudGateLayout,
  CUMULUS_CONFIG,
  CUMULUS_TOWERS,
  cumulusLayout,
  cumulusTowerLayout,
  heapDepth,
  HEAP_TRIANGLES,
  insertNearest,
  pushAmount,
  STRATUS_CONFIG,
  stratusLayout,
  TOWER_HEAPS,
  towersInView,
  veilOpacity,
} from './cloudMath'
import { getLandmarks, LANDMARK_CONFIG } from './landmarks'
import { ROUTE } from './route'
import { townSite } from './sea'
import { TERRAIN_CONFIG } from './terrainConfig'

type Vec3 = [number, number, number]

const heap = buildHeapGeometry()
const puffs = cumulusLayout(CUMULUS_CONFIG)
const sheets = stratusLayout(STRATUS_CONFIG)

function vertex(index: number): Vec3 {
  const p = heap.positions
  return [p[index * 3] ?? 0, p[index * 3 + 1] ?? 0, p[index * 3 + 2] ?? 0]
}

function faceNormal(f: number): { normal: Vec3; centroid: Vec3 } {
  const [a, b, c] = [0, 1, 2].map((k) => vertex(heap.indices[f * 3 + k] ?? 0)) as [Vec3, Vec3, Vec3]
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  return {
    normal: [
      (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
      (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
      (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
    ],
    centroid: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
  }
}

describe('cumulus heap geometry', () => {
  it('has the triangle count the budget is built on', () => {
    expect(heap.indices.length / 3).toBe(HEAP_TRIANGLES)
    expect(HEAP_TRIANGLES).toBe(160)
  })

  it('is flat-bottomed: nothing below y = 0, a whole base disc at y = 0 facing down', () => {
    let downFaces = 0
    for (let v = 0; v < heap.positions.length / 3; v++) {
      expect(vertex(v)[1]).toBeGreaterThanOrEqual(0)
    }
    for (let f = 0; f < HEAP_TRIANGLES; f++) {
      const { normal, centroid } = faceNormal(f)
      if (centroid[1] === 0) {
        expect(normal[1]).toBeLessThan(0)
        downFaces++
      }
    }
    expect(downFaces).toBeGreaterThanOrEqual(16)
  })

  it('winds every face outward, so front-face culling keeps the outside', () => {
    for (let f = 0; f < HEAP_TRIANGLES; f++) {
      const { normal, centroid } = faceNormal(f)
      if (centroid[1] === 0) continue
      // Outward from a point on the axis a little above the base.
      const out = [centroid[0], centroid[1] - 0.3, centroid[2]]
      const dot = normal[0] * (out[0] ?? 0) + normal[1] * (out[1] ?? 0) + normal[2] * (out[2] ?? 0)
      expect(dot).toBeGreaterThan(0)
    }
  })

  it('reads as a heap, not a ball: wider than tall, widest near the base', () => {
    let maxRadius = 0
    let maxRadiusHeight = 0
    let top = 0
    for (let v = 0; v < heap.positions.length / 3; v++) {
      const [x, y, z] = vertex(v)
      const r = Math.hypot(x, z)
      if (r > maxRadius) {
        maxRadius = r
        maxRadiusHeight = y
      }
      top = Math.max(top, y)
    }
    expect(maxRadius * 2).toBeGreaterThan(top * 1.8)
    expect(maxRadiusHeight).toBeLessThan(top * 0.5)
  })

  it('has unit normals', () => {
    for (let v = 0; v < heap.normals.length; v += 3) {
      const length = Math.hypot(
        heap.normals[v] ?? 0,
        heap.normals[v + 1] ?? 0,
        heap.normals[v + 2] ?? 0,
      )
      expect(length).toBeCloseTo(1, 5)
    }
  })
})

describe('cumulusLayout', () => {
  it('is deterministic', () => {
    expect(cumulusLayout(CUMULUS_CONFIG)).toEqual(puffs)
  })

  it('builds the configured clusters in the 300–500 m band, each on one flat base', () => {
    const bases = new Map<string, number[]>()
    for (const puff of puffs) {
      const key = `${puff.clusterX},${puff.clusterZ}`
      bases.set(key, [...(bases.get(key) ?? []), puff.y])
      expect(puff.y).toBeGreaterThanOrEqual(300)
      expect(puff.y + puff.height).toBeLessThanOrEqual(650)
      expect(puff.radius).toBeGreaterThanOrEqual(CUMULUS_CONFIG.puffRadiusMin)
      expect(puff.radius).toBeLessThanOrEqual(CUMULUS_CONFIG.puffRadiusMax)
      // Wider than tall: the heap is 2 × radius across.
      expect(puff.height).toBeLessThan(puff.radius * 1.4)
    }
    expect(bases.size).toBe(CUMULUS_CONFIG.clusters)
    for (const ys of bases.values()) {
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(8)
    }
  })

  it('respawns past the full haze fade, so the jump is never seen', () => {
    expect(CUMULUS_CONFIG.fieldSize / 2).toBeGreaterThan(TERRAIN_CONFIG.hazeFadeEnd)
    expect(STRATUS_CONFIG.fieldSize / 2).toBeGreaterThan(TERRAIN_CONFIG.hazeFadeEnd)
  })
})

describe('cloudGateLayout', () => {
  const center = { x: 500, y: 300, z: -800 }
  const approach = { x: 420, z: -710 }
  const gate = cloudGateLayout(center, approach)

  it('is deterministic, centred on the route, and uses the existing heap size range', () => {
    expect(gate).toHaveLength(CLOUD_GATE_HEAPS)
    expect(gate).toEqual(cloudGateLayout(center, approach))
    expect(gate.some((puff) => puff.offsetX === 0 && puff.offsetZ === 0)).toBe(true)
    for (const puff of gate) {
      expect(puff.fixed).toBe(true)
      expect(puff.radius).toBeGreaterThanOrEqual(CUMULUS_CONFIG.puffRadiusMin)
      expect(puff.radius).toBeLessThanOrEqual(CUMULUS_CONFIG.puffRadiusMax)
      expect(Math.hypot(puff.offsetX, puff.offsetZ)).toBeLessThanOrEqual(140)
    }
  })

  it('overlaps along the route line without a gap wider than the 11 m wingspan', () => {
    const dx = center.x - approach.x
    const dz = center.z - approach.z
    const length = Math.hypot(dx, dz)
    const intervals = gate
      .map((puff) => {
        const along = (puff.offsetX * dx + puff.offsetZ * dz) / length
        return [along - puff.radius, along + puff.radius] as const
      })
      .sort((a, b) => a[0] - b[0])
    let coveredTo = intervals[0]?.[1] ?? 0
    for (const [start, end] of intervals.slice(1)) {
      expect(start - coveredTo).toBeLessThanOrEqual(11)
      coveredTo = Math.max(coveredTo, end)
    }
  })
})

describe('stratusLayout', () => {
  it('is deterministic and sits well above the cumulus tops', () => {
    expect(stratusLayout(STRATUS_CONFIG)).toEqual(sheets)
    const cumulusTop = Math.max(...puffs.map((p) => p.y + p.height))
    for (const sheet of sheets) {
      expect(sheet.y).toBeGreaterThan(cumulusTop + 500)
      expect(sheet.height).toBeLessThan(sheet.width / 3)
    }
  })

  it('stays inside the camera far plane at the window edge', () => {
    const far = TERRAIN_CONFIG.viewDistance * 1.2
    const corner = Math.hypot(STRATUS_CONFIG.fieldSize / 2, STRATUS_CONFIG.altitudeMax)
    // Sheets past the haze end are sky-coloured anyway; this checks the band doesn't clip nearer.
    expect(Math.hypot(TERRAIN_CONFIG.hazeFadeEnd, STRATUS_CONFIG.altitudeMax)).toBeLessThan(far)
    expect(corner).toBeGreaterThan(TERRAIN_CONFIG.hazeFadeEnd)
  })
})

describe('budget (#70)', () => {
  it('stays under 40k triangles for both layers', () => {
    const triangles = puffs.length * HEAP_TRIANGLES + sheets.length * 2
    expect(triangles).toBeLessThan(40_000)
  })
})

describe('heapDepth', () => {
  const puff = {
    clusterX: 0,
    clusterZ: 0,
    offsetX: 0,
    y: 0,
    offsetZ: 0,
    radius: 100,
    stretch: 1.5,
    height: 60,
    yaw: Math.PI / 2,
  }

  it('is 0 at the core, above 1 outside, infinite under the base', () => {
    expect(heapDepth(0, 0, 0, puff)).toBe(0)
    expect(heapDepth(0, 200, 0, puff)).toBeGreaterThan(1)
    expect(heapDepth(0, -1, 0, puff)).toBe(Infinity)
  })

  it('follows the heap’s yaw and stretch', () => {
    // Turned a quarter, the stretched local z axis lies along world x.
    expect(heapDepth(120, 5, 0, puff)).toBeLessThan(1)
    expect(heapDepth(0, 5, 120, puff)).toBeGreaterThan(1)
  })
})

describe('cloudBand', () => {
  const sun = [...SUN_DIRECTION] as Vec3

  it('lights tops and sunward sides, shades undersides and the far side', () => {
    expect(cloudBand([0, 1, 0], sun)).toBe(1)
    expect(cloudBand(sun, sun)).toBe(1)
    expect(cloudBand([0, -1, 0], sun)).toBe(0)
    const away = [-sun[0], 0, -sun[2]]
    const length = Math.hypot(away[0] ?? 0, away[2] ?? 0)
    expect(cloudBand([(away[0] ?? 0) / length, 0, (away[2] ?? 0) / length], sun)).toBe(0)
  })
})

/** three's ACES filmic fit for a grey input: what a linear value becomes on screen. */
function acesGrey(x: number): number {
  const v = x / 0.6
  return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)
}

describe('cloud tints', () => {
  for (const [name, preset] of Object.entries(lightingPresets)) {
    it(`${name}: lit band is brighter than the shade band and never blooms`, () => {
      const top = hexToLinear(preset.cloudLight).map((c) => c * CLOUD_LIT_GAIN)
      const shade = hexToLinear(preset.cloudShadow).map((c) => c * CLOUD_SHADE_GAIN)
      top.forEach((c, i) => expect(c).toBeGreaterThan(shade[i] ?? 0))
      expect(acesGrey(Math.max(...top))).toBeLessThan(
        POST_FX.bloom.threshold - POST_FX.bloom.smoothing,
      )
    })
  }
})

describe('fly-through burst', () => {
  it('veils to 30% and is gone by 0.4 s', () => {
    expect(veilOpacity(-0.1)).toBe(0)
    expect(veilOpacity(0)).toBe(0)
    expect(veilOpacity(CLOUD_BURST.veilAttack)).toBeCloseTo(0.3, 9)
    expect(veilOpacity(0.2)).toBeGreaterThan(0)
    expect(veilOpacity(0.2)).toBeLessThan(0.3)
    expect(veilOpacity(0.4)).toBe(0)
    for (let age = 0; age < 0.5; age += 0.01) expect(veilOpacity(age)).toBeLessThanOrEqual(0.3)
  })

  it('pushes out by 0.4 s, holds, and eases back to rest', () => {
    expect(pushAmount(0)).toBe(0)
    expect(pushAmount(0.2)).toBeGreaterThan(0.5)
    expect(pushAmount(0.4)).toBe(1)
    expect(pushAmount(1)).toBe(1)
    expect(pushAmount(2.5)).toBeGreaterThan(0)
    expect(pushAmount(2.5)).toBeLessThan(1)
    expect(pushAmount(CLOUD_BURST.pushReturn)).toBe(0)
    expect(pushAmount(Infinity)).toBe(0)
  })

  it('pushes six heaps', () => {
    expect(CLOUD_BURST.pushedPuffs).toBe(6)
  })
})

describe('insertNearest', () => {
  it('keeps the smallest depths in order without allocating', () => {
    const indices = new Int32Array(3)
    const depths = new Float32Array(3)
    let filled = 0
    const input = [5, 2, 9, 1, 7, 3, Infinity]
    input.forEach((depth, i) => {
      filled = insertNearest(indices, depths, filled, i, depth)
    })
    expect(filled).toBe(3)
    expect(Array.from(depths)).toEqual([1, 2, 3])
    expect(Array.from(indices)).toEqual([3, 1, 5])
  })

  it('fills partially when fewer candidates than slots', () => {
    const indices = new Int32Array(6)
    const depths = new Float32Array(6)
    let filled = insertNearest(indices, depths, 0, 4, 0.5)
    filled = insertNearest(indices, depths, filled, 2, 0.25)
    expect(filled).toBe(2)
    expect(Array.from(indices.slice(0, 2))).toEqual([2, 4])
  })
})

describe('cumulus towers (#234)', () => {
  const period = TERRAIN_CONFIG.worldPeriod
  const town = townSite(TERRAIN_CONFIG)
  const sea = TERRAIN_CONFIG.massifs.sea

  it('has 6 to 10 towers, 2 to 3 times the field’s largest heap, based 300 to 600 m up', () => {
    expect(CUMULUS_TOWERS.length).toBeGreaterThanOrEqual(6)
    expect(CUMULUS_TOWERS.length).toBeLessThanOrEqual(10)
    for (const tower of CUMULUS_TOWERS) {
      expect(tower.radius / CUMULUS_CONFIG.puffRadiusMax).toBeGreaterThanOrEqual(2)
      expect(tower.radius / CUMULUS_CONFIG.puffRadiusMax).toBeLessThanOrEqual(3)
      expect(tower.base).toBeGreaterThanOrEqual(300)
      expect(tower.base).toBeLessThanOrEqual(600)
    }
  })

  it('stands at least 3 towers over the sea, 2 to 6 km from the town', () => {
    const over = CUMULUS_TOWERS.filter(
      (t) =>
        t.x >= sea.minX &&
        t.x <= sea.maxX &&
        t.z >= sea.minZ &&
        t.z <= sea.maxZ &&
        Math.hypot(t.x - town.x, t.z - town.z) >= 2000 &&
        Math.hypot(t.x - town.x, t.z - town.z) <= 6000,
    )
    expect(over.length).toBeGreaterThanOrEqual(3)
  })

  it('lays out fixed heaps on the shared mesh, deterministically', () => {
    const heaps = cumulusTowerLayout()
    expect(heaps).toHaveLength(CUMULUS_TOWERS.length * TOWER_HEAPS)
    expect(heaps).toEqual(cumulusTowerLayout())
    for (const heap of heaps) expect(heap.fixed).toBe(true)
  })

  it('keeps 2 or 3 towers in the chase view at every route s', () => {
    for (let s = 0; s < ROUTE.length; s += 25) {
      const p = ROUTE.pointAt(s)
      const t = ROUTE.tangentAt(s)
      const count = towersInView(p.x, p.z, t.x, t.z, CUMULUS_TOWERS, period)
      expect(count, `s ${s}`).toBeGreaterThanOrEqual(2)
      expect(count, `s ${s}`).toBeLessThanOrEqual(3)
    }
  })

  it('blocks no landmark sightline, the cloud gate or the route', () => {
    const margin = 100
    const sightlines = [
      ...getLandmarks().map((l) => ({
        from: ROUTE.pointAt(l.station - LANDMARK_CONFIG.revealDistance),
        to: { x: l.x, z: l.z },
      })),
      { from: ROUTE.pointAt(5500 - 2300), to: town },
    ]
    const gate = ROUTE.pointAt(4900)
    for (const tower of CUMULUS_TOWERS) {
      const clear = tower.radius * 1.6 + margin
      for (const { from, to } of sightlines) {
        expect(segmentDistance(tower, from, to)).toBeGreaterThan(clear)
      }
      expect(Math.hypot(tower.x - gate.x, tower.z - gate.z)).toBeGreaterThan(clear)
      // Off the route by the core's radius and a margin: the base is 300 m up, so a shoulder
      // overhanging the valley edge is fine.
      expect(Math.abs(ROUTE.nearest(tower.x, tower.z).lateral)).toBeGreaterThan(
        tower.radius + margin,
      )
    }
  })
})

/** m, distance from `p` to the segment a-b in the ground plane. */
function segmentDistance(
  p: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const u = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
  )
  return Math.hypot(p.x - (a.x + u * dx), p.z - (a.z + u * dz))
}
