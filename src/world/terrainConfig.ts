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
  /**
   * 1/m, how quickly the near, warm haze layer (`fog` token) thickens with distance. Higher =
   * hazier foreground. See `src/world/atmosphere.ts` for the full haze model.
   */
  hazeDensity: number
  /** 0..1, the most the near warm layer ever covers. Keeps close terrain from going flat. */
  hazeWarmMax: number
  /** m, where the far layer starts blending terrain into the sky colour behind it */
  hazeFadeStart: number
  /**
   * m, where the far layer reaches 100% sky colour. Must stay short of the nearest terrain edge
   * (`viewDistance` minus half a chunk diagonal) so the edge is never visible.
   */
  hazeFadeEnd: number
  /** 0..1, how far the horizon facing away from the sun shifts from `sky-horizon` to `sky-zenith` */
  hazeCoolShift: number
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
  hazeDensity: 0.0003,
  hazeWarmMax: 0.5,
  hazeFadeStart: 1200,
  hazeFadeEnd: 9000,
  hazeCoolShift: 0.45,
}
