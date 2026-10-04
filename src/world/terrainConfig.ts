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
 * Trees, bushes and boulders (#75). Placement is `scatter.ts` (pure), drawing is `Foliage.tsx`.
 * Densities are chances per jittered grid cell, 0..1.
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
  /** m, no foliage within this height above `waterLevel` (keeps it off wet shores) */
  shoreMargin: number
}

/**
 * A gap in the basin's ridge ring (#171). The gap runs along the ray from the basin centre through
 * (`x`, `z`), which is a route control point from `docs/world-route.md`.
 */
export interface BasinNotch {
  /** m, world position of the notch's route point. Sets the ray's bearing and where the floor is `floorHeight`. */
  x: number
  z: number
  /** m, height of the notch floor at (`x`, `z`) */
  floorHeight: number
  /** m, half the notch width at the floor. The floor is flat across this. */
  halfWidth: number
  /** m, how far the flanks take to rise from the floor to the ridge. Wider = gentler walls. */
  flank: number
  /** m, how far past (`x`, `z`) the notch keeps its floor before the land returns to noise */
  extension: number
}

/**
 * The home basin (#171, `docs/world-route.md`): a gently sloped floor around the spawn, a ridge
 * ring, and two notches. Shaped by `applyBasin` in `basin.ts`, after lakes and rivers, so the
 * designed heights hold.
 */
export interface BasinConfig {
  /** m, world position of the basin centre, which is the spawn */
  centerX: number
  centerZ: number
  /** m, height of the floor at the centre, and where the floor meets the ridge foot */
  floorCenterHeight: number
  floorEdgeHeight: number
  /** m, radius of the flat-ish floor. The ridge starts to rise here. */
  clearRadius: number
  /** m, radius of the ridge crest */
  ridgeRadius: number
  /** m, radius where the basin has faded fully back into the noise terrain */
  blendRadius: number
  /** m, mean absolute crest height. Varies round the ring by `crestVariation`. */
  crestHeight: number
  /** 0..1, how far the crest varies round the ring, as a share of `crestHeight` */
  crestVariation: number
  /** m, how far the terrain noise moves the floor and the ridge, at most */
  floorNoise: number
  ridgeNoise: number
  /** Outbound cut first, return notch second. */
  notches: readonly [BasinNotch, BasinNotch]
}

/**
 * The route valley (#172): carved along `ROUTE` (`route.ts`) from the outbound cut to the return
 * notch, by `applyRouteValley` in `routeValley.ts`. The floor's height and width come from the
 * route's control points. These set the walls and the joins with the basin notches.
 */
export interface RouteValleyConfig {
  /** m, the most the terrain noise lifts the valley floor above the route's `floorHeight` */
  floorNoise: number
  /** m, how softly a wall shoulder meets terrain that already stands taller. Keeps it C1. */
  wallSoftness: number
  /**
   * m of route, how far the valley takes to fade in past the cut and out before the return notch.
   * Both fades sit where the notch already holds the same floor, so the join is seamless.
   */
  joinLength: number
  /**
   * m, inside a tight bend, how far apart the distances to two stretches of route may be for both
   * walls to blend. Without it the walls jump where the nearer stretch changes. At most
   * `RIVAL_BAND` in `route.ts`.
   */
  bendBlend: number
  /** ± share of the route's half width the floor breathes by along the route (#221) */
  widthVariation: number
  /** m, feature length of the breathing along the route */
  widthWavelength: number
  /** m, the floor's half width never goes under or over these, whatever the noise */
  minHalfWidth: number
  maxHalfWidth: number
  /** m, the most the floor centre wanders off the route line */
  meander: number
  /** m, feature length of the meander along the route */
  meanderWavelength: number
  /** m of route round each landmark station where width and meander hold the route's own */
  stationClearance: number
  /** m of route past a station's clearance or a join over which width and meander ease in */
  calmLength: number
  /** m of route, the mean stretch before the cliff swaps sides (each swap ±40 %) */
  swapLength: number
  /** m, run and shoulder lift of a wall at its steepest (a cliff) and its gentlest (a grass slope) */
  cliffRise: number
  cliffLift: number
  grassRise: number
  grassLift: number
  /**
   * m, the #172 wall's run and lift. Where the route skirts the home basin the wall facing it
   * keeps these, so the basin's designed ridge holds.
   */
  neutralRise: number
  neutralLift: number
  /** m past the basin's ridge radius within which the route counts as skirting the basin */
  basinClearance: number
  /** ± share each wall's run wanders by on its own, and the feature length of that wander */
  riseJitter: number
  jitterWavelength: number
  /** ± m of ridged noise on each shoulder's lift, and its feature length along the route */
  shoulderNoise: number
  shoulderWavelength: number
  /** m past a shoulder over which the wall blends back into the terrain */
  fadeWidth: number
  gullies: GullyConfig
}

/** Side valleys cut back through the route valley's walls (#221). */
export interface GullyConfig {
  count: number
  /** m, mouth width */
  minWidth: number
  maxWidth: number
  /** m back from the floor's edge. Cut short where the head would leave the route grid. */
  minLength: number
  maxLength: number
  /** m of route, the least distance between two mouths */
  spacing: number
  /** m of route per m outward, the most a gully's line slants off square to the route */
  skew: number
  /** m of climb per m of length, the gully bed's rise from the floor to its head */
  climb: number
  /** 0..1, share of the half width that is flat bed. The rest is its side walls. */
  bedShare: number
  /** m, how softly the bed meets the ground it cuts */
  softness: number
}

/**
 * The waterfall's plunge pool (#173): a round pond dug into the valley floor in front of the
 * waterfall's station, so the fall lands in water. Applied last, by `applyPlungePool`.
 */
export interface PlungePoolConfig {
  /** m from the waterfall's origin to the pool's centre, along the way the cliff faces */
  centerDistance: number
  /** m, radius of the pool's flat bed, and where its bank has blended back into the floor */
  innerRadius: number
  outerRadius: number
  /** m below `waterLevel` the bed lies */
  depth: number
}

/**
 * The lake the route river runs into (#174), scooped round the return notch's route point by
 * `applyRiverLake` in `routeRiver.ts`.
 */
export interface RiverLakeConfig {
  /** m, radius of the lake's flat bed, and where its shore has blended back into the ground */
  innerRadius: number
  outerRadius: number
  /** m below `waterLevel` the bed lies. At least the channel's `depth`, so the channel ends unseen. */
  depth: number
}

/**
 * The river along the route's low stretches (#174), cut down the route's centreline by
 * `applyRouteRiver` in `routeRiver.ts` wherever the route's designed `floorHeight` is in the low
 * band. Noise rivers are kept out of the valley corridor.
 */
export interface RouteRiverConfig {
  /**
   * m above `waterLevel`: at or below `fullFloor` the designed floor holds the whole channel, by
   * `dryFloor` none, and between them the channel tapers out on the floor.
   */
  fullFloor: number
  dryFloor: number
  /** m, half the width of the channel's flat bed */
  halfWidth: number
  /** m beyond the bed over which the banks ease back into the floor */
  bankWidth: number
  /** m below `waterLevel` the bed lies */
  depth: number
  lake: RiverLakeConfig
}

export interface TerrainConfig {
  /** World seed. Same seed = same world. Any string works. */
  seed: string
  /**
   * m, the world repeats every this far along x and along z (#176): a wrapping world with no edge.
   * Keep it over twice `viewDistance`, so no repeat is ever in view, and a whole number of every
   * lattice the world is built on (terrain LOD spacings, foliage cells).
   */
  worldPeriod: number
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
  /** The home basin around the spawn. */
  basin: BasinConfig
  /** The valley along the authored route, between the basin's two notches. */
  valley: RouteValleyConfig
  plungePool: PlungePoolConfig
  /** The river along the route's low stretches, and the lake it runs into. */
  river: RouteRiverConfig
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
  worldPeriod: 24000,
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
  basin: {
    centerX: 1750,
    centerZ: 2000,
    floorCenterHeight: 40,
    floorEdgeHeight: 55,
    clearRadius: 700,
    ridgeRadius: 1150,
    blendRadius: 1650,
    crestHeight: 260,
    crestVariation: 0.12,
    floorNoise: 4,
    ridgeNoise: 20,
    notches: [
      { x: 1938, z: 1248, floorHeight: 46, halfWidth: 160, flank: 300, extension: 550 },
      { x: 622, z: 2094, floorHeight: 35, halfWidth: 250, flank: 300, extension: 550 },
    ],
  },
  valley: {
    floorNoise: 3,
    wallSoftness: 30,
    joinLength: 150,
    bendBlend: 60,
    widthVariation: 0.25,
    widthWavelength: 900,
    minHalfWidth: 150,
    maxHalfWidth: 300,
    meander: 40,
    meanderWavelength: 1100,
    stationClearance: 300,
    calmLength: 400,
    swapLength: 2000,
    // A cliff: steepest pitch ~66°, well into the rock band. A grass slope: ~16° on average and
    // ~24° at its steepest, before the shoulder noise.
    cliffRise: 80,
    cliffLift: 120,
    grassRise: 210,
    grassLift: 62,
    neutralRise: 180,
    neutralLift: 100,
    basinClearance: 600,
    riseJitter: 0.1,
    jitterWavelength: 700,
    shoulderNoise: 40,
    shoulderWavelength: 500,
    // Widest floor (300) + meander (40) + grass run with jitter (231) + fade stays under the
    // route grid's 720 m reach.
    fadeWidth: 140,
    gullies: {
      count: 6,
      minWidth: 60,
      maxWidth: 120,
      minLength: 300,
      maxLength: 600,
      spacing: 900,
      skew: 0.4,
      climb: 0.2,
      bedShare: 0.35,
      softness: 10,
    },
  },
  plungePool: {
    // The bank starts 30 m clear of the cliff, past the edge of its 25 m footprint.
    centerDistance: 85,
    innerRadius: 30,
    outerRadius: 55,
    depth: 4,
  },
  river: {
    // Full on the 33 to 36 m river reaches, gone by 38 m: the waterfall (37.8 m) and the arch
    // (39 m) stations stay dry.
    fullFloor: 4,
    dryFloor: 6,
    halfWidth: 20,
    bankWidth: 50,
    depth: 4,
    // Inside the return notch's 250 m half floor, so the shore stays on flat ground.
    lake: { innerRadius: 110, outerRadius: 230, depth: 6 },
  },
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
    treeDensity: 0.24,
    bushDensity: 0.04,
    boulderDensity: 0.06,
    coniferLow: 150,
    coniferHigh: 230,
    shoreMargin: 1.5,
  },
}
