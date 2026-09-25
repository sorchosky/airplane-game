import { describe, expect, it } from 'vitest'
import { heightAt } from './heightfield'
import { TERRAIN_CONFIG } from './terrainConfig'
import {
  buildTileBuffers,
  buildTileIndices,
  gridVertexCount,
  tileVertexCount,
} from './tileGeometry'

const config = TERRAIN_CONFIG

describe('buildTileIndices', () => {
  it('references only real vertices and forms whole triangles', () => {
    for (const quads of [8, 32, 64]) {
      const indices = buildTileIndices(quads)
      expect(indices.length % 3).toBe(0)
      expect(Math.max(...indices)).toBe(tileVertexCount(quads) - 1)
      expect(indices.length).toBe(quads * quads * 6 + 4 * quads * 12)
    }
  })

  it('winds the grid counter-clockwise seen from above so the top face is visible', () => {
    const quads = 4
    const { positions } = buildTileBuffers(0, 0, quads, 16, {
      ...config,
      hillHeight: 0,
      mountainHeight: 0,
      peakHeight: 0,
      plateauHeight: 0,
    })
    const indices = buildTileIndices(quads)
    const x = (vertex: number) => positions[vertex * 3] ?? 0
    const z = (vertex: number) => positions[vertex * 3 + 2] ?? 0
    const [a, b, c] = [indices[0] ?? 0, indices[1] ?? 0, indices[2] ?? 0]
    // Y component of cross(b - a, c - a). Positive means the face normal points up.
    const crossY = (z(b) - z(a)) * (x(c) - x(a)) - (x(b) - x(a)) * (z(c) - z(a))
    expect(crossY).toBeGreaterThan(0)
  })
})

describe('buildTileBuffers', () => {
  const originX = 1024
  const originZ = -2048
  const quads = 16
  const spacing = 32
  const tile = buildTileBuffers(originX, originZ, quads, spacing, config)

  it('samples the heightfield at each grid vertex', () => {
    for (const [i, j] of [
      [0, 0],
      [5, 9],
      [16, 16],
    ] as const) {
      const v = (j * (quads + 1) + i) * 3
      expect(tile.positions[v]).toBe(i * spacing)
      expect(tile.positions[v + 2]).toBe(j * spacing)
      expect(tile.positions[v + 1]).toBeCloseTo(
        heightAt(originX + i * spacing, originZ + j * spacing, config),
        3,
      )
    }
  })

  it('hangs a skirt below every edge vertex', () => {
    const skirtStart = gridVertexCount(quads)
    const depth = spacing * config.skirtDepthFactor
    for (let k = 0; k < 4 * quads; k++) {
      const v = (skirtStart + k) * 3
      const y = tile.positions[v + 1] ?? 0
      const x = tile.positions[v] ?? 0
      const z = tile.positions[v + 2] ?? 0
      const onEdge = x === 0 || z === 0 || x === quads * spacing || z === quads * spacing
      expect(onEdge).toBe(true)
      expect(y).toBeCloseTo(heightAt(originX + x, originZ + z, config) - depth, 3)
    }
  })

  it('shares identical edge heights and normals with its neighbour', () => {
    const right = buildTileBuffers(originX + quads * spacing, originZ, quads, spacing, config)
    for (let j = 0; j <= quads; j++) {
      const a = (j * (quads + 1) + quads) * 3 // right edge of `tile`
      const b = j * (quads + 1) * 3 // left edge of `right`
      expect(right.positions[b + 1]).toBe(tile.positions[a + 1])
      expect(right.normals[b + 1]).toBe(tile.normals[a + 1])
    }
  })

  it('reports bounds that contain every vertex', () => {
    for (let v = 1; v < tile.positions.length; v += 3) {
      const y = tile.positions[v] ?? 0
      expect(y).toBeGreaterThanOrEqual(tile.minHeight - 1e-3)
      expect(y).toBeLessThanOrEqual(tile.maxHeight + 1e-3)
    }
  })
})
