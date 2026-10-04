import { ROUTE, type Route } from './route'
import { valleyReach } from './routeValley'
import type { MassifConfig, TerrainConfig } from './terrainConfig'

// Pure mountain-massif mask (#222). Where the mask is 1 the terrain rises into a massif of ridged
// noise (`heightfield.ts` shapes the relief). The mask is authored, not left to noise, so the loop
// gets mountains where the art wants them and nowhere it would break a designed feature:
//   regions  soft discs round authored centres, their edges roughened by the terrain's warp
//   valley   zero inside the route valley's reach (its outer flank fade), so the #221 walls hold,
//            rising over a ramp beyond it
//   basin    zero inside the basin's blend radius, so its designed ring and notches hold
//   sea      zero inside the inland sea's footprint (#223) and a margin round it
// Every blend is a smoothstep, so the mask is C1 but where the route distance field's bilinear
// cells meet, which a ramp hundreds of metres long hides.

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** m, edge of a route distance field cell */
const FIELD_CELL = 40
/** m of route between the samples the field measures to. Chords this short sit on the spline. */
const FIELD_SAMPLE = 20

/**
 * Distance to the route on a coarse grid. `ROUTE.nearest` only answers within its 720 m grid, and
 * the mask's ramp runs past that, so the field covers the route's bounding box out to where the
 * ramp ends. Past the field the route is further than the ramp, and the gate is fully open.
 */
interface DistanceField {
  readonly x0: number
  readonly z0: number
  readonly columns: number
  readonly rows: number
  readonly distance: Float32Array
}

interface Prepared {
  readonly field: DistanceField
  /** m from the route line where the valley gate starts to open, and where it is fully open */
  readonly valleyStart: number
  readonly valleyEnd: number
}

const preparedFor = new WeakMap<TerrainConfig, WeakMap<Route, Prepared>>()

function buildField(route: Route, margin: number): DistanceField {
  const count = Math.ceil(route.length / FIELD_SAMPLE)
  const xs = new Float64Array(count + 1)
  const zs = new Float64Array(count + 1)
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i <= count; i++) {
    const p = route.pointAt((i / count) * route.length)
    xs[i] = p.x
    zs[i] = p.z
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  const x0 = Math.floor((minX - margin) / FIELD_CELL) * FIELD_CELL
  const z0 = Math.floor((minZ - margin) / FIELD_CELL) * FIELD_CELL
  const columns = Math.ceil((maxX + margin - x0) / FIELD_CELL) + 1
  const rows = Math.ceil((maxZ + margin - z0) / FIELD_CELL) + 1
  // Each chord stamps the cells within `margin` of it; the rest stay at `margin`, which is past
  // the gate's ramp, so they read as open.
  const squared = new Float64Array(columns * rows).fill(margin * margin)
  for (let k = 0; k < count; k++) {
    const ax = xs[k]!
    const az = zs[k]!
    const bx = xs[k + 1]! - ax
    const bz = zs[k + 1]! - az
    const lengthSquared = bx * bx + bz * bz
    const i0 = Math.max(0, Math.floor((Math.min(ax, ax + bx) - margin - x0) / FIELD_CELL))
    const i1 = Math.min(columns - 1, Math.ceil((Math.max(ax, ax + bx) + margin - x0) / FIELD_CELL))
    const j0 = Math.max(0, Math.floor((Math.min(az, az + bz) - margin - z0) / FIELD_CELL))
    const j1 = Math.min(rows - 1, Math.ceil((Math.max(az, az + bz) + margin - z0) / FIELD_CELL))
    for (let j = j0; j <= j1; j++) {
      const pz = z0 + j * FIELD_CELL - az
      for (let i = i0; i <= i1; i++) {
        const px = x0 + i * FIELD_CELL - ax
        const t = Math.min(1, Math.max(0, (px * bx + pz * bz) / lengthSquared))
        const dx = px - bx * t
        const dz = pz - bz * t
        const d = dx * dx + dz * dz
        const o = j * columns + i
        if (d < squared[o]!) squared[o] = d
      }
    }
  }
  const distance = new Float32Array(columns * rows)
  for (let o = 0; o < distance.length; o++) distance[o] = Math.sqrt(squared[o]!)
  return { x0, z0, columns, rows, distance }
}

// `heightAt` runs per vertex with one config and route, so the last lookup skips the maps.
let lastConfig: TerrainConfig | null = null
let lastRoute: Route | null = null
let lastPrepared: Prepared | null = null

function prepare(config: TerrainConfig, route: Route): Prepared {
  if (config === lastConfig && route === lastRoute && lastPrepared) return lastPrepared
  lastPrepared = prepareFresh(config, route)
  lastConfig = config
  lastRoute = route
  return lastPrepared
}

function prepareFresh(config: TerrainConfig, route: Route): Prepared {
  let byRoute = preparedFor.get(config)
  if (!byRoute) {
    byRoute = new WeakMap()
    preparedFor.set(config, byRoute)
  }
  const cached = byRoute.get(route)
  if (cached) return cached
  const m = config.massifs
  const valleyStart = valleyReach(config, route) + m.valleyClearance
  const valleyEnd = valleyStart + m.valleyRamp
  const result = { field: buildField(route, valleyEnd + FIELD_CELL), valleyStart, valleyEnd }
  byRoute.set(route, result)
  return result
}

/** m, distance from (x, z) to the route line, or Infinity past the field's reach. Bilinear. */
export function routeDistance(x: number, z: number, config: TerrainConfig, route = ROUTE): number {
  const { field } = prepare(config, route)
  const u = (x - field.x0) / FIELD_CELL
  const v = (z - field.z0) / FIELD_CELL
  if (u < 0 || v < 0 || u >= field.columns - 1 || v >= field.rows - 1) return Infinity
  const i = Math.floor(u)
  const j = Math.floor(v)
  const fu = u - i
  const fv = v - j
  const d = field.distance
  const o = j * field.columns + i
  const top = d[o]! + (d[o + 1]! - d[o]!) * fu
  const bottom = d[o + field.columns]! + (d[o + field.columns + 1]! - d[o + field.columns]!) * fu
  return top + (bottom - top) * fv
}

/** 0..1, how far outside an axis-aligned box (grown by `margin`) a point is, over `ramp` m. */
function boxGate(x: number, z: number, sea: MassifConfig['sea']): number {
  const dx = Math.max(sea.minX - sea.margin - x, 0, x - sea.maxX - sea.margin)
  const dz = Math.max(sea.minZ - sea.margin - z, 0, z - sea.maxZ - sea.margin)
  return smoothstep(0, sea.ramp, Math.hypot(dx, dz))
}

/**
 * 0..1, how much of the authored regions covers the point. `wx`, `wz` is the point after the
 * terrain's domain warp, so region edges wander with the land instead of drawing circles.
 */
export function regionMask(wx: number, wz: number, massifs: MassifConfig): number {
  let mask = 0
  for (const region of massifs.regions) {
    const dx = (wx - region.x) / region.radiusX
    const dz = (wz - region.z) / region.radiusZ
    const r = Math.sqrt(dx * dx + dz * dz)
    if (r >= 1) continue
    // Full over the core, easing out across the rim: a smooth union keeps overlaps from doubling.
    const cover = 1 - smoothstep(massifs.core, 1, r)
    mask = mask + cover - mask * cover
  }
  return mask
}

/**
 * 0..1, where the massifs stand at (x, z), given the warped point (`wx`, `wz`) the regions are
 * read at. `x`, `z` must already be the copy nearest the basin centre, as in `heightAt`. Zero
 * inside the route valley's reach, the basin and the inland sea's footprint.
 */
export function massifMask(
  x: number,
  z: number,
  wx: number,
  wz: number,
  config: TerrainConfig,
  route = ROUTE,
): number {
  const m = config.massifs
  const region = regionMask(wx, wz, m)
  if (region <= 0) return 0
  const basin = config.basin
  const fromBasin = Math.hypot(x - basin.centerX, z - basin.centerZ)
  const basinGate = smoothstep(basin.blendRadius, basin.blendRadius + m.basinRamp, fromBasin)
  if (basinGate <= 0) return 0
  const seaGate = boxGate(x, z, m.sea)
  if (seaGate <= 0) return 0
  const { valleyStart, valleyEnd } = prepare(config, route)
  const valleyGate = smoothstep(valleyStart, valleyEnd, routeDistance(x, z, config, route))
  return region * basinGate * seaGate * valleyGate
}
