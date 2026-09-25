/**
 * One LOD ring: tiles whose nearest edge is closer than `maxDistance` (m) to the plane's chunk are
 * built with `spacing` (m between vertices). `tileChunks` lets far rings merge a square of
 * neighbouring chunks into one mesh (1 = one 512 m chunk, 2 = a 2x2 block, ...) to save draw calls.
 * Must be a power of two and never shrink as `maxDistance` grows.
 */
export interface LodRing {
  maxDistance: number
  spacing: number
  tileChunks: number
}

export interface TerrainConfig {
  /** World seed. Same seed = same world. Any string works. */
  seed: string
  /** m, peak-to-trough height of the rolling hills that cover most of the world */
  hillHeight: number
  /** m, extra height the tallest ridged mountain ranges add on top of the hills */
  mountainHeight: number
  /** m, extra height of the rare isolated peaks */
  peakHeight: number
  /** m, height of the flat tops of plateaus above the surrounding hills */
  plateauHeight: number
  /** m, edge length of one terrain chunk */
  chunkSize: number
  /** Nearest ring first. See `LodRing`. */
  lodRings: readonly LodRing[]
  /** m, nothing is built past this */
  viewDistance: number
  /** Skirt depth as a multiple of a tile's vertex spacing. Skirts hide cracks between LODs. */
  skirtDepthFactor: number
  /** Renderer device pixel ratio cap. Retina phones otherwise render 3x the pixels. */
  maxPixelRatio: number
}

export const TERRAIN_CONFIG: TerrainConfig = {
  seed: 'airplane-game',
  hillHeight: 120,
  mountainHeight: 450,
  peakHeight: 220,
  plateauHeight: 140,
  chunkSize: 512,
  lodRings: [
    { maxDistance: 1000, spacing: 8, tileChunks: 1 },
    { maxDistance: 2500, spacing: 16, tileChunks: 1 },
    { maxDistance: 5000, spacing: 32, tileChunks: 2 },
    { maxDistance: 10000, spacing: 64, tileChunks: 4 },
  ],
  viewDistance: 10000,
  skirtDepthFactor: 2,
  maxPixelRatio: 1.5,
}
