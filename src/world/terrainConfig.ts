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

/**
 * Height- and slope-based color bands, applied in the terrain shader and mirrored by
 * `terrainColorAt` in `terrainColor.ts`. Slope is `1 - normal.y`: 0 on flat ground, about 0.13 at
 * 30 degrees, 0.29 at 45 degrees, 1 on a vertical cliff. Every threshold is nudged by a smooth
 * noise (-1..1) times its jitter, so band edges wander instead of following contour lines.
 */
export interface TerrainBands {
  /** m above `waterLevel` where the sand band ends and grass begins */
  sandHeight: number
  /** m, half-width of the sand-to-grass blend */
  sandBlend: number
  /** slope where grass turns to rock */
  rockSlope: number
  /** slope, half-width of the grass-to-rock blend */
  rockBlend: number
  /** m, height of the snow line */
  snowHeight: number
  /** m, half-width of the snow line blend */
  snowBlend: number
  /** slope above which snow doesn't stick and rock shows through */
  snowMaxSlope: number
  /** m, how far the noise moves the sand line up or down */
  sandJitter: number
  /** m, how far the noise moves the snow line up or down */
  snowJitter: number
  /** how far the noise moves the rock and snow slope thresholds */
  slopeJitter: number
  /** 0..1, how far the noise darkens grass from `grass-light` toward `grass-shadow` */
  grassVariation: number
  /** m, feature size of the color noise. Large = broad, painterly patches. */
  noiseScale: number
  /** m below `waterLevel` where the lake bed is fully tinted `water-deep` */
  deepWaterDepth: number
  /** 0..1, how strongly the lake bed takes the water tint (shallow and deep) */
  underwaterTint: number
  /** m, height of the soft foam line on the shore above `waterLevel` */
  foamHeight: number
  // Painterly surface detail (#69, `docs/art-bible.md` §5), on top of the bands.
  /** m, feature size of the macro noise that drifts the grass hue and value */
  macroScale: number
  /** degrees, how far the macro noise turns the grass hue either way */
  macroHueDegrees: number
  /** 0..1, how far the macro noise moves the grass value either way */
  macroValue: number
  /** m, feature size of the brush breakup noise */
  brushScale: number
  /** 0..1, how far the brush noise moves the value either way */
  brushValue: number
  /** 0..1, share of broad macro noise in rock breakup; the rest is brush noise */
  rockMacroMix: number
  /** m from the camera where the brush breakup starts to fade, and where it is gone */
  brushFadeStart: number
  brushFadeEnd: number
  /** 0..1, how far grass facing the sun (within 30°) leans to `grass-light` */
  sunTintToward: number
  /** 0..1, how far grass facing away from the sun leans to its cool mix */
  sunTintAway: number
  /** 0..1, how far that cool mix leans from `grass-shadow` to the sky's hue, at the same brightness */
  sunTintCool: number
}

/**
 * Grass, trees, bushes and boulders (#75). Placement is `scatter.ts` (pure), drawing is
 * `Foliage.tsx` and `Grass.tsx`. Densities are chances per jittered grid cell, 0..1.
 */
export interface FoliageConfig {
  /** m, nothing past this. Trees thin out from `foliageFadeStart` to here. */
  foliageDistance: number
  foliageFadeStart: number
  /**
   * m, edge of a foliage chunk: the unit trees are scattered, cached and streamed in. Smaller than
   * a terrain chunk so the GPU buffers, rebuilt on each crossing, can leave out more of what the
   * distance fade hides.
   */
  foliageChunk: number
  /** m, bushes and boulders are small: they thin out from `foliageFadeStart` to here instead */
  smallDistance: number
  /** m, trees and boulders past this have no outline hull: it would be under a pixel wide */
  outlineDistance: number
  /** m, edge of a tree scatter cell. One candidate per cell, jittered, so trees are never closer than a few metres. */
  treeCell: number
  /** 0..1, share of a cell's jitter range used; below 1 keeps neighbours apart (Poisson-ish) */
  jitter: number
  /** m, feature size of the grove noise that clusters trees on grass */
  groveScale: number
  /** grove noise (0..1) where trees start, and where they reach `treeDensity` */
  groveLow: number
  groveHigh: number
  /** chance a cell in a full grove holds a tree */
  treeDensity: number
  /** chance a cell holds a bush, highest on grove edges */
  bushDensity: number
  /** chance a cell on the rock band holds a boulder */
  boulderDensity: number
  /** m, height where conifers start to replace round trees, and where they have fully */
  coniferLow: number
  coniferHigh: number
  /** m, no trees or grass within this height above `waterLevel` (keeps them off wet shores) */
  shoreMargin: number
  /** m, grass cards only within this distance of the plane, thinning from `grassFadeStart` */
  grassDistance: number
  grassFadeStart: number
  /** m, above-ground height where grass starts to thin, and where it is gone */
  grassAltitudeFade: number
  grassAltitudeMax: number
  /** m, edge of a grass tile: the unit grass is scattered, cached and streamed in */
  grassTile: number
  /** m, edge of a grass scatter cell (one card per cell at full density) */
  grassCell: number
  /** Hz, grass sway frequency at cruise speed */
  grassSwayHz: number
  /** m, sway of a card's tip at cruise speed */
  grassSway: number
  /** m above ground where the plane's downwash starts to flatten grass, and radius it reaches */
  downwashHeight: number
  downwashRadius: number
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
  /** m, height of the water plane. Anything carved below it is a lake or river. */
  waterLevel: number
  /**
   * m, ground below this height is scooped into lake basins. The lower the ground, the deeper the
   * scoop, up to `lakeDepth`.
   */
  lakeBasinHeight: number
  /**
   * m, how far below `lakeBasinHeight` the scoop reaches full depth. Keep it above
   * `1.5 * lakeDepth`, or the scoop overshoots and throws up a rim around each lake.
   */
  lakeBasinBand: number
  /** m, the most a lake basin lowers the ground */
  lakeDepth: number
  /** m, depth of a river bed below `waterLevel` */
  riverDepth: number
  /** m, feature size of the river network. Larger = longer, lazier bends. */
  riverScale: number
  /** 0..1 in river-noise units, half-width of the water channel. Roughly 80 m at the default scale. */
  riverWidth: number
  /** 0..1 in river-noise units, half-width of the valley the river cuts through the hills */
  riverValleyWidth: number
  /**
   * m, rivers fade out as the ground they would cut through rises from 60% of this to this
   * height, so they run through lowlands and peter out in the hills instead of cutting mountains.
   */
  riverMaxHeight: number
  /** Terrain color bands. */
  bands: TerrainBands
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
  /** Grass, trees, bushes and boulders. */
  foliage: FoliageConfig
}

export const TERRAIN_CONFIG: TerrainConfig = {
  seed: 'airplane-game',
  hillHeight: 120,
  mountainHeight: 450,
  peakHeight: 220,
  plateauHeight: 140,
  waterLevel: 32,
  lakeBasinHeight: 48,
  lakeBasinBand: 30,
  lakeDepth: 18,
  riverDepth: 5,
  riverScale: 3200,
  riverWidth: 0.035,
  riverValleyWidth: 0.15,
  riverMaxHeight: 180,
  bands: {
    sandHeight: 3,
    sandBlend: 1.5,
    rockSlope: 0.2,
    rockBlend: 0.05,
    snowHeight: 310,
    snowBlend: 12,
    snowMaxSlope: 0.4,
    sandJitter: 1.5,
    snowJitter: 25,
    slopeJitter: 0.05,
    grassVariation: 0.4,
    noiseScale: 420,
    deepWaterDepth: 14,
    underwaterTint: 0.75,
    foamHeight: 0.6,
    macroScale: 400,
    macroHueDegrees: 6,
    macroValue: 0.06,
    brushScale: 70,
    brushValue: 0.04,
    rockMacroMix: 0.65,
    brushFadeStart: 1000,
    brushFadeEnd: 1500,
    sunTintToward: 0.35,
    sunTintAway: 0.35,
    sunTintCool: 0.35,
  },
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
  foliage: {
    foliageDistance: 1500,
    foliageFadeStart: 250,
    foliageChunk: 128,
    smallDistance: 700,
    outlineDistance: 600,
    treeCell: 16,
    jitter: 0.8,
    groveScale: 700,
    groveLow: 0.5,
    groveHigh: 0.7,
    treeDensity: 0.27,
    bushDensity: 0.04,
    boulderDensity: 0.06,
    coniferLow: 150,
    coniferHigh: 230,
    shoreMargin: 1.5,
    grassDistance: 250,
    grassFadeStart: 30,
    grassAltitudeFade: 70,
    grassAltitudeMax: 120,
    grassTile: 32,
    grassCell: 3.2,
    grassSwayHz: 0.6,
    grassSway: 0.18,
    downwashHeight: 30,
    downwashRadius: 18,
  },
}
