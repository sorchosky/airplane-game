import { describe, expect, it } from 'vitest'
import { chunkCoord, chunkKey, ringForDistance, selectTiles, type TileSpec } from './chunks'
import { TERRAIN_CONFIG } from './terrainConfig'

const config = TERRAIN_CONFIG
const { chunkSize } = config

/** Every chunk each tile covers, as chunk keys. */
function coveredChunks(tile: TileSpec): string[] {
  const keys: string[] = []
  for (let i = 0; i < tile.tileChunks; i++) {
    for (let j = 0; j < tile.tileChunks; j++) {
      keys.push(chunkKey(tile.tx * tile.tileChunks + i, tile.tz * tile.tileChunks + j))
    }
  }
  return keys
}

describe('chunkCoord / chunkKey', () => {
  it('floors toward negative infinity so chunk 0 spans 0 to 512 m', () => {
    expect(chunkCoord(0, chunkSize)).toBe(0)
    expect(chunkCoord(511.9, chunkSize)).toBe(0)
    expect(chunkCoord(512, chunkSize)).toBe(1)
    expect(chunkCoord(-0.1, chunkSize)).toBe(-1)
    expect(chunkCoord(-512, chunkSize)).toBe(-1)
    expect(chunkCoord(-512.1, chunkSize)).toBe(-2)
  })

  it('keys are unique per chunk', () => {
    expect(chunkKey(1, -2)).not.toBe(chunkKey(-1, 2))
    expect(chunkKey(12, 3)).not.toBe(chunkKey(1, 23))
  })
})

describe('ringForDistance', () => {
  it('maps the ticket LOD table', () => {
    expect(ringForDistance(0, config)).toBe(0)
    expect(ringForDistance(999, config)).toBe(0)
    expect(ringForDistance(1000, config)).toBe(1)
    expect(ringForDistance(2499, config)).toBe(1)
    expect(ringForDistance(2500, config)).toBe(2)
    expect(ringForDistance(4999, config)).toBe(2)
    expect(ringForDistance(5000, config)).toBe(3)
    expect(ringForDistance(9999, config)).toBe(3)
    expect(ringForDistance(10000, config)).toBe(-1)
  })

  it('matches the spacing and quad counts in the ticket', () => {
    const spacings = config.lodRings.map((ring) => ring.spacing)
    expect(spacings).toEqual([8, 16, 32, 64])
    expect(spacings.map((s) => chunkSize / s)).toEqual([64, 32, 16, 8])
  })
})

describe('selectTiles', () => {
  const tiles = selectTiles(3, -7, config)

  it('covers every chunk at most once (no overlaps)', () => {
    const seen = new Set<string>()
    for (const tile of tiles) {
      for (const key of coveredChunks(tile)) {
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
  })

  it('leaves no holes inside the view distance', () => {
    const covered = new Set(tiles.flatMap(coveredChunks))
    const cx = 3
    const cz = -7
    const reach = Math.floor(config.viewDistance / chunkSize) - 1
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        // Any chunk whose far corner is inside the view distance must be drawn.
        const far = Math.hypot((Math.abs(i) + 1) * chunkSize, (Math.abs(j) + 1) * chunkSize)
        if (far < config.viewDistance) expect(covered.has(chunkKey(cx + i, cz + j))).toBe(true)
      }
    }
  })

  it('uses full detail under the plane and coarser tiles further out', () => {
    const own = tiles.find((tile) => coveredChunks(tile).includes(chunkKey(3, -7)))
    expect(own?.ring).toBe(0)
    expect(own?.quads).toBe(64)

    const centerX = 3.5 * chunkSize
    const centerZ = -6.5 * chunkSize
    for (const tile of tiles) {
      const dx = Math.max(tile.originX - centerX, 0, centerX - (tile.originX + tile.size))
      const dz = Math.max(tile.originZ - centerZ, 0, centerZ - (tile.originZ + tile.size))
      expect(ringForDistance(Math.hypot(dx, dz), config)).toBe(tile.ring)
      expect(tile.quads * tile.spacing).toBe(tile.size)
    }
  })

  it('merges far chunks into bigger tiles to keep draw calls down', () => {
    expect(tiles.length).toBeLessThan(400)
    expect(tiles.some((tile) => tile.tileChunks === 4)).toBe(true)
  })

  it('only changes when the plane changes chunk', () => {
    const again = selectTiles(3, -7, config).map((tile) => tile.key)
    expect(again).toEqual(tiles.map((tile) => tile.key))
    const moved = selectTiles(4, -7, config).map((tile) => tile.key)
    expect(moved).not.toEqual(again)
  })
})
