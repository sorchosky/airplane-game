import { heightAt } from './heightfield'
import type { TerrainConfig } from './terrainConfig'

// Pure vertex and index buffer builders for one terrain tile. Runs inside the terrain worker.
//
// Each tile is a (quads + 1)² grid of vertices plus a "skirt": a copy of the tile's outer edge
// pushed straight down. Where a fine tile meets a coarse one, the coarse edge can't follow every
// bump of the fine edge, which would leave thin see-through cracks. The skirt is a short vertical
// wall under every edge that fills those cracks. It's simpler than stitching edges vertex by
// vertex and works for any LOD combination.

export interface TileBuffers {
  /** xyz per vertex, relative to the tile's min corner */
  positions: Float32Array
  normals: Float32Array
  minHeight: number
  maxHeight: number
}

export function gridVertexCount(quads: number): number {
  return (quads + 1) * (quads + 1)
}

export function skirtVertexCount(quads: number): number {
  return 4 * quads
}

export function tileVertexCount(quads: number): number {
  return gridVertexCount(quads) + skirtVertexCount(quads)
}

/**
 * Grid-vertex index of each perimeter vertex, walking the edge once all the way round. Skirt
 * vertex `k` sits under perimeter vertex `k`.
 */
function perimeterIndices(quads: number): number[] {
  const row = quads + 1
  const loop: number[] = []
  for (let i = 0; i < quads; i++) loop.push(i) // z = 0 edge, +x
  for (let j = 0; j < quads; j++) loop.push(j * row + quads) // x = max edge, +z
  for (let i = quads; i > 0; i--) loop.push(quads * row + i) // z = max edge, -x
  for (let j = quads; j > 0; j--) loop.push(j * row) // x = 0 edge, -z
  return loop
}

/**
 * Triangle indices for a tile with `quads` quads per edge. Depends only on `quads`, so one index
 * buffer is shared by every pooled geometry of that size.
 */
export function buildTileIndices(quads: number): Uint16Array | Uint32Array {
  const row = quads + 1
  const gridCount = gridVertexCount(quads)
  const perimeter = perimeterIndices(quads)
  // Grid: 2 triangles per quad. Skirt: 2 triangles per edge segment, emitted with both windings
  // so the skirt is visible from either side without making the whole terrain double-sided.
  const indexCount = quads * quads * 6 + perimeter.length * 12
  const indices =
    tileVertexCount(quads) > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount)

  let n = 0
  for (let j = 0; j < quads; j++) {
    for (let i = 0; i < quads; i++) {
      const a = j * row + i
      const b = a + row
      const c = a + 1
      const d = b + 1
      // Counter-clockwise seen from above (+Y), so the top face is the front face.
      indices[n++] = a
      indices[n++] = b
      indices[n++] = c
      indices[n++] = c
      indices[n++] = b
      indices[n++] = d
    }
  }

  for (let k = 0; k < perimeter.length; k++) {
    const next = (k + 1) % perimeter.length
    const top0 = perimeter[k] ?? 0
    const top1 = perimeter[next] ?? 0
    const bottom0 = gridCount + k
    const bottom1 = gridCount + next
    indices[n++] = top0
    indices[n++] = bottom0
    indices[n++] = top1
    indices[n++] = top1
    indices[n++] = bottom0
    indices[n++] = bottom1
    indices[n++] = top0
    indices[n++] = top1
    indices[n++] = bottom0
    indices[n++] = top1
    indices[n++] = bottom1
    indices[n++] = bottom0
  }

  return indices
}

/** Samples the heightfield and builds positions and normals for one tile. */
export function buildTileBuffers(
  originX: number,
  originZ: number,
  quads: number,
  spacing: number,
  config: TerrainConfig,
): TileBuffers {
  const row = quads + 1
  // Heights on a grid padded by one sample on each side, so edge normals use real neighbours and
  // match the adjacent tile exactly (no lighting seams between same-LOD tiles).
  const padded = quads + 3
  const heights = new Float32Array(padded * padded)
  for (let j = 0; j < padded; j++) {
    for (let i = 0; i < padded; i++) {
      heights[j * padded + i] = heightAt(
        originX + (i - 1) * spacing,
        originZ + (j - 1) * spacing,
        config,
      )
    }
  }
  const h = (i: number, j: number) => heights[(j + 1) * padded + (i + 1)] ?? 0

  const vertexCount = tileVertexCount(quads)
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  let minHeight = Infinity
  let maxHeight = -Infinity

  for (let j = 0; j < row; j++) {
    for (let i = 0; i < row; i++) {
      const v = (j * row + i) * 3
      const height = h(i, j)
      positions[v] = i * spacing
      positions[v + 1] = height
      positions[v + 2] = j * spacing

      const nx = h(i - 1, j) - h(i + 1, j)
      const ny = 2 * spacing
      const nz = h(i, j - 1) - h(i, j + 1)
      const length = Math.hypot(nx, ny, nz)
      normals[v] = nx / length
      normals[v + 1] = ny / length
      normals[v + 2] = nz / length

      if (height < minHeight) minHeight = height
      if (height > maxHeight) maxHeight = height
    }
  }

  const skirtDepth = spacing * config.skirtDepthFactor
  const gridCount = gridVertexCount(quads)
  perimeterIndices(quads).forEach((gridIndex, k) => {
    const src = gridIndex * 3
    const dst = (gridCount + k) * 3
    positions[dst] = positions[src] ?? 0
    positions[dst + 1] = (positions[src + 1] ?? 0) - skirtDepth
    positions[dst + 2] = positions[src + 2] ?? 0
    normals[dst] = normals[src] ?? 0
    normals[dst + 1] = normals[src + 1] ?? 1
    normals[dst + 2] = normals[src + 2] ?? 0
  })

  return { positions, normals, minHeight: minHeight - skirtDepth, maxHeight }
}
