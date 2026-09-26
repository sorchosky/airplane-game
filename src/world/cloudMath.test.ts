import { describe, expect, it } from 'vitest'
import { POST_FX } from '../render/postFx'
import { lightingPresets } from '../styles/tokens'
import { hexToLinear, SUN_DIRECTION } from './atmosphere'
import {
  buildHeapGeometry,
  CLOUD_BURST,
  CLOUD_LIT_GAIN,
  CLOUD_SHADE_GAIN,
  cloudBand,
  CUMULUS_CONFIG,
  cumulusLayout,
  heapDepth,
  HEAP_TRIANGLES,
  insertNearest,
  pushAmount,
  STRATUS_CONFIG,
  stratusLayout,
  veilOpacity,
} from './cloudMath'
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
