import type { TerrainConfig } from './terrainConfig'

// Pure chunk and LOD math. No React or Three.
//
// LOD ("level of detail"): terrain near the plane is built from a fine grid of vertices, terrain
// far away from a coarse one, because distant hills cover only a few pixels on screen. The world
// is cut into square chunks, and each chunk's distance picks its grid spacing from the LOD ring
// table in `terrainConfig`.
//
// Far rings merge neighbouring chunks into one bigger "tile" (one mesh, one draw call). The
// selection below is a quadtree: start from the biggest tiles, and split any tile that is too
// close for its size into four. That way tiles of different sizes never overlap or leave holes.

/** One mesh's worth of terrain. `tx`/`tz` are in units of `tileChunks` chunks. */
export interface TileSpec {
  key: string
  tx: number
  tz: number
  tileChunks: number
  ring: number
  spacing: number
  /** Quads along one edge: tile edge length / spacing */
  quads: number
  /** World-space min corner of the tile, metres */
  originX: number
  originZ: number
  /** Edge length, metres */
  size: number
}

/** Which chunk a world coordinate falls in, along one axis. */
export function chunkCoord(value: number, chunkSize: number): number {
  return Math.floor(value / chunkSize)
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`
}

export function tileKey(tx: number, tz: number, tileChunks: number, ring: number): string {
  return `${tileChunks}:${tx},${tz}:${ring}`
}

/** Index into `lodRings` for a distance in metres, or -1 when past the view distance. */
export function ringForDistance(distance: number, config: TerrainConfig): number {
  if (distance >= config.viewDistance) return -1
  const index = config.lodRings.findIndex((ring) => distance < ring.maxDistance)
  return index
}

/** Distance from a point to the nearest point of an axis-aligned square. 0 if inside. */
function distanceToSquare(
  px: number,
  pz: number,
  minX: number,
  minZ: number,
  size: number,
): number {
  const dx = Math.max(minX - px, 0, px - (minX + size))
  const dz = Math.max(minZ - pz, 0, pz - (minZ + size))
  return Math.hypot(dx, dz)
}

/**
 * Every tile to draw while the plane is in chunk (`cx`, `cz`). Distances are measured from that
 * chunk's centre, so the result only changes when the plane crosses a chunk boundary.
 */
export function selectTiles(cx: number, cz: number, config: TerrainConfig): TileSpec[] {
  const { chunkSize, lodRings, viewDistance } = config
  const rootChunks = Math.max(...lodRings.map((ring) => ring.tileChunks))
  const rootSize = rootChunks * chunkSize
  const centerX = (cx + 0.5) * chunkSize
  const centerZ = (cz + 0.5) * chunkSize

  const tiles: TileSpec[] = []

  const visit = (tx: number, tz: number, tileChunks: number) => {
    const size = tileChunks * chunkSize
    const originX = tx * size
    const originZ = tz * size
    const distance = distanceToSquare(centerX, centerZ, originX, originZ, size)
    const ring = ringForDistance(distance, config)
    if (ring < 0) return
    const lod = lodRings[ring]
    if (!lod) return

    if (lod.tileChunks < tileChunks) {
      const half = tileChunks / 2
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          visit(tx * 2 + i, tz * 2 + j, half)
        }
      }
      return
    }

    tiles.push({
      key: tileKey(tx, tz, tileChunks, ring),
      tx,
      tz,
      tileChunks,
      ring,
      spacing: lod.spacing,
      quads: Math.max(1, Math.round(size / lod.spacing)),
      originX,
      originZ,
      size,
    })
  }

  const minRoot = Math.floor((centerX - viewDistance) / rootSize)
  const maxRoot = Math.floor((centerX + viewDistance) / rootSize)
  const minRootZ = Math.floor((centerZ - viewDistance) / rootSize)
  const maxRootZ = Math.floor((centerZ + viewDistance) / rootSize)
  for (let tx = minRoot; tx <= maxRoot; tx++) {
    for (let tz = minRootZ; tz <= maxRootZ; tz++) {
      visit(tx, tz, rootChunks)
    }
  }

  return tiles
}
