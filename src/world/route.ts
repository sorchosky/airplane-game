export interface RouteControlPoint {
  readonly x: number
  readonly z: number
  readonly floorHeight: number
  readonly valleyWidth: number
}

export type RoutePoint = RouteControlPoint

export interface RouteTangent {
  readonly x: number
  readonly z: number
}

export interface NearestRoutePoint {
  readonly s: number
  /** Positive on the left of the route direction, negative on the right. */
  readonly lateral: number
  readonly floorHeight: number
  readonly valleyWidth: number
}

export interface Route {
  readonly length: number
  pointAt(s: number): RoutePoint
  tangentAt(s: number): RouteTangent
  /** Exact nearest point on the route, however far away (x, z) is. */
  nearest(x: number, z: number): NearestRoutePoint
  /**
   * Nearest point on the route, or null when it is more than `maxDistance` away. Within
   * `GRID_REACH` a miss costs one grid lookup, so terrain can ask this for every vertex.
   */
  nearest(x: number, z: number, maxDistance: number): NearestRoutePoint | null
  /**
   * Inside a tight bend two stretches of route can be about equally near, and the nearest point
   * jumps from one to the other across the line between them. Where another stretch is within
   * `band` m (at most `RIVAL_BAND`) of being as near as the nearest, this is that stretch's
   * nearest point, so callers can blend across the jump. Otherwise null. Only answers within
   * `GRID_REACH`.
   */
  rival(x: number, z: number, band: number): RivalRoutePoint | null
}

export interface RivalRoutePoint extends NearestRoutePoint {
  /**
   * m, how far the rival's distance dips below the furthest point of the route between it and the
   * nearest point. 0 where the rival stretch first becomes a separate dip, as (x, z) crosses into
   * the bend, so blending by it fades the rival in from nothing.
   */
  readonly prominence: number
}

interface Sample extends RoutePoint {
  readonly s: number
}

const LOOKUP_STEPS_PER_POINT = 64
const NEAREST_SPACING = 2
const GRID_SIZE = 32
/**
 * m, how far from the route the grid answers queries. Covers the widest valley reach the terrain
 * carves (#172: half the widest floor plus the flank), with a margin. Past it a query is a miss.
 */
export const GRID_REACH = 720
/** Every this many nearest samples (32 m) stamps the grid. Each cell then refines its stamp. */
const STAMP_STRIDE = 32
/** Samples, the furthest one tangent jump of a query may move. */
const QUERY_JUMP = 8
/** m, the widest band `rival` answers across. */
export const RIVAL_BAND = 60
/** Nearest-stretch candidates each grid cell keeps while the grid is built. */
const CANDIDATES = 4
/**
 * Samples apart (32 m) beyond which two refined nearest candidates are different stretches of
 * route. Candidates are refined to local minima of distance first, so one stretch's land within a
 * sample or two of each other, while a tight bend's two stretches can be under 250 m apart.
 */
const SEPARATE_STRETCH = 16

const mix = (a: number, b: number, t: number): number => a + (b - a) * t

/** Builds a closed, centripetal Catmull-Rom route with an arc-length lookup table. */
export function createRoute(points: readonly RouteControlPoint[]): Route {
  if (points.length < 4) throw new Error('A closed route needs at least four control points')

  const valueAt = (u: number): RoutePoint => {
    const wrapped = ((u % points.length) + points.length) % points.length
    const i = Math.floor(wrapped)
    const t = wrapped - i
    const p0 = points[(i - 1 + points.length) % points.length]!
    const p1 = points[i]!
    const p2 = points[(i + 1) % points.length]!
    const p3 = points[(i + 2) % points.length]!
    const d01 = Math.sqrt(Math.hypot(p1.x - p0.x, p1.z - p0.z))
    const d12 = Math.sqrt(Math.hypot(p2.x - p1.x, p2.z - p1.z))
    const d23 = Math.sqrt(Math.hypot(p3.x - p2.x, p3.z - p2.z))
    const k0 = 0
    const k1 = k0 + d01
    const k2 = k1 + d12
    const k3 = k2 + d23
    const k = mix(k1, k2, t)
    const interpolate = (key: keyof RouteControlPoint): number => {
      const a1 = mix(p0[key], p1[key], (k - k0) / (k1 - k0))
      const a2 = mix(p1[key], p2[key], (k - k1) / (k2 - k1))
      const a3 = mix(p2[key], p3[key], (k - k2) / (k3 - k2))
      const b1 = mix(a1, a2, (k - k0) / (k2 - k0))
      const b2 = mix(a2, a3, (k - k1) / (k3 - k1))
      return mix(b1, b2, (k - k1) / (k2 - k1))
    }
    return {
      x: interpolate('x'),
      z: interpolate('z'),
      floorHeight: interpolate('floorHeight'),
      valleyWidth: interpolate('valleyWidth'),
    }
  }

  const lookup: Sample[] = []
  let length = 0
  let previous = valueAt(0)
  lookup.push({ ...previous, s: 0 })
  const lookupCount = points.length * LOOKUP_STEPS_PER_POINT
  for (let i = 1; i <= lookupCount; i++) {
    const point = valueAt((i / lookupCount) * points.length)
    length += Math.hypot(point.x - previous.x, point.z - previous.z)
    lookup.push({ ...point, s: length })
    previous = point
  }

  const pointAt = (distance: number): RoutePoint => {
    const s = ((distance % length) + length) % length
    let low = 0
    let high = lookup.length - 1
    while (high - low > 1) {
      const middle = (low + high) >> 1
      if (lookup[middle]!.s <= s) low = middle
      else high = middle
    }
    const a = lookup[low]!
    const b = lookup[high]!
    const t = (s - a.s) / (b.s - a.s)
    return {
      x: mix(a.x, b.x, t),
      z: mix(a.z, b.z, t),
      floorHeight: mix(a.floorHeight, b.floorHeight, t),
      valleyWidth: mix(a.valleyWidth, b.valleyWidth, t),
    }
  }

  const sampleCount = Math.ceil(length / NEAREST_SPACING)
  // Samples every ~2 m, kept flat: queries read them per terrain vertex.
  const sampleX = new Float64Array(sampleCount)
  const sampleZ = new Float64Array(sampleCount)
  const sampleS = new Float64Array(sampleCount)
  const sampleFloor = new Float64Array(sampleCount)
  const sampleWidth = new Float64Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    const s = (i * length) / sampleCount
    const point = pointAt(s)
    sampleX[i] = point.x
    sampleZ[i] = point.z
    sampleS[i] = s
    sampleFloor[i] = point.floorHeight
    sampleWidth[i] = point.valleyWidth
  }
  // Unit tangent at each sample, so a query can jump straight to the sample level with it.
  const tangentX = new Float64Array(sampleCount)
  const tangentZ = new Float64Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    const before = (i - 1 + sampleCount) % sampleCount
    const after = (i + 1) % sampleCount
    const magnitude = Math.hypot(
      sampleX[after]! - sampleX[before]!,
      sampleZ[after]! - sampleZ[before]!,
    )
    tangentX[i] = (sampleX[after]! - sampleX[before]!) / magnitude
    tangentZ[i] = (sampleZ[after]! - sampleZ[before]!) / magnitude
  }
  const margin = GRID_REACH + GRID_SIZE
  const minX = Math.min(...sampleX) - margin
  const minZ = Math.min(...sampleZ) - margin
  const columns = Math.ceil((Math.max(...sampleX) + margin - minX) / GRID_SIZE)
  const rows = Math.ceil((Math.max(...sampleZ) + margin - minZ) / GRID_SIZE)

  /** `index` wrapped round the loop. Callers stay within one lap, so no modulo. */
  const wrap = (index: number): number =>
    index < 0 ? index + sampleCount : index >= sampleCount ? index - sampleCount : index
  const distance2To = (index: number, x: number, z: number): number => {
    const i = wrap(index)
    const deltaX = x - sampleX[i]!
    const deltaZ = z - sampleZ[i]!
    return deltaX * deltaX + deltaZ * deltaZ
  }
  /** Samples apart along the loop, either way round. */
  const indexGap = (a: number, b: number): number => {
    const gap = Math.abs(a - b)
    return Math.min(gap, sampleCount - gap)
  }

  // Results of `walk`: [index, distance squared]. It runs per terrain vertex, so it writes them
  // here rather than allocate (a closure `let` holding a double allocates on every write too).
  const walked = new Float64Array(2)
  /**
   * Pattern search along the route from sample `start`: step while the distance to (x, z) drops,
   * halving the step down to one sample. Lands on the nearest sample of that stretch of route.
   */
  function walk(start: number, firstStep: number, x: number, z: number): void {
    let index = start
    let distance2 = distance2To(index, x, z)
    for (let step = firstStep; step >= 1; step >>= 1) {
      for (;;) {
        const forward = distance2To(index + step, x, z)
        if (forward < distance2) {
          index += step
          distance2 = forward
          continue
        }
        const backward = distance2To(index - step, x, z)
        if (backward < distance2) {
          index -= step
          distance2 = backward
          continue
        }
        break
      }
    }
    walked[0] = wrap(index)
    walked[1] = distance2
  }

  /**
   * From sample `start`, jump along the route by the query's offset along the tangent there, then
   * walk the last sample or two. A cell's start is within a few samples of the query's nearest,
   * so this needs far fewer distance checks than walking from the start.
   */
  function seek(start: number, maxJump: number, x: number, z: number): void {
    let index = start
    for (let jump = 0; jump < 2; jump++) {
      const i = wrap(index)
      const along = (x - sampleX[i]!) * tangentX[i]! + (z - sampleZ[i]!) * tangentZ[i]!
      const step = Math.round(along / NEAREST_SPACING)
      if (step === 0) break
      // Cap the jump: on the inside of a tight bend the tangent overshoots.
      index = wrap(index + Math.max(-maxJump, Math.min(maxJump, step)))
    }
    walk(index, 1, x, z)
  }

  // Each cell holds the sample nearest its centre (`grid`), or -1 when no sample is within reach of
  // any point in the cell. Where another stretch of route is nearly as close, for instance inside a
  // tight bend, the cell also holds that stretch's nearest sample (`gridOther`), since a query
  // elsewhere in the cell may be nearer to it. A query walks from both and keeps the nearer.
  //
  // To find them, every stamp (one sample in `STAMP_STRIDE`) that is a local minimum of distance to
  // a cell's centre, nearer than the stamps either side, is a candidate for that cell. A cell keeps
  // its `CANDIDATES` nearest. The nearest stamp overall is always one of them.
  const cells = columns * rows
  const candidates = new Int32Array(cells * CANDIDATES).fill(-1)
  const candidateDistance2 = new Float64Array(cells * CANDIDATES).fill(Infinity)
  const stampSpacing = STAMP_STRIDE * NEAREST_SPACING
  const cellReach = GRID_REACH + GRID_SIZE * Math.SQRT1_2 + stampSpacing / 2
  const cellReach2 = cellReach * cellReach
  const cellSpan = Math.ceil(cellReach / GRID_SIZE)
  for (let i = 0; i < sampleCount; i += STAMP_STRIDE) {
    const px = sampleX[i]!
    const pz = sampleZ[i]!
    const before = wrap(i - STAMP_STRIDE)
    const after = wrap(i + STAMP_STRIDE)
    const cellZ = Math.floor((pz - minZ) / GRID_SIZE)
    for (let gz = Math.max(0, cellZ - cellSpan); gz <= Math.min(rows - 1, cellZ + cellSpan); gz++) {
      const centerZ = minZ + (gz + 0.5) * GRID_SIZE
      const deltaZ = centerZ - pz
      // Only the cells across this row that are within reach: a disc, not the whole square.
      const halfRow = Math.sqrt(Math.max(0, cellReach2 - deltaZ * deltaZ)) / GRID_SIZE
      const firstX = Math.max(0, Math.floor((px - minX) / GRID_SIZE - halfRow))
      const lastX = Math.min(columns - 1, Math.ceil((px - minX) / GRID_SIZE + halfRow))
      for (let gx = firstX; gx <= lastX; gx++) {
        const centerX = minX + (gx + 0.5) * GRID_SIZE
        const deltaX = centerX - px
        const distance2 = deltaX * deltaX + deltaZ * deltaZ
        if (distance2 > cellReach2) continue
        if (distance2 > distance2To(before, centerX, centerZ)) continue
        if (distance2 >= distance2To(after, centerX, centerZ)) continue
        // Replace the furthest of the cell's candidates, if this one is nearer.
        const base = (gz * columns + gx) * CANDIDATES
        let furthest = base
        for (let k = base + 1; k < base + CANDIDATES; k++) {
          if (candidateDistance2[k]! > candidateDistance2[furthest]!) furthest = k
        }
        if (distance2 < candidateDistance2[furthest]!) {
          candidates[furthest] = i
          candidateDistance2[furthest] = distance2
        }
      }
    }
  }

  // Refine the candidates to the fine samples nearest the cell centre, so queries start a few
  // samples away. The nearest is the cell's start. Another stretch is kept only if it could be
  // nearest, or a rival, somewhere in the cell: distances move by at most the cell's diagonal
  // across it.
  const grid = new Int32Array(cells).fill(-1)
  const gridOther = new Int32Array(cells).fill(-1)
  const refinedIndex = new Int32Array(CANDIDATES)
  const refinedDistance2 = new Float64Array(CANDIDATES)
  const cellSlack = GRID_SIZE * Math.SQRT2
  for (let gz = 0; gz < rows; gz++)
    for (let gx = 0; gx < columns; gx++) {
      const cell = gz * columns + gx
      const base = cell * CANDIDATES
      const centerX = minX + (gx + 0.5) * GRID_SIZE
      const centerZ = minZ + (gz + 0.5) * GRID_SIZE
      let best = -1
      for (let k = 0; k < CANDIDATES; k++) {
        refinedIndex[k] = -1
        if (candidates[base + k]! < 0) continue
        seek(candidates[base + k]!, STAMP_STRIDE, centerX, centerZ)
        refinedIndex[k] = walked[0]!
        refinedDistance2[k] = walked[1]!
        if (best < 0 || walked[1]! < refinedDistance2[best]!) best = k
      }
      if (best < 0) continue
      grid[cell] = refinedIndex[best]!
      const limit = Math.sqrt(refinedDistance2[best]!) + cellSlack + RIVAL_BAND
      let other = -1
      for (let k = 0; k < CANDIDATES; k++) {
        if (refinedIndex[k]! < 0 || indexGap(refinedIndex[k]!, grid[cell]!) <= SEPARATE_STRETCH)
          continue
        if (Math.sqrt(refinedDistance2[k]!) > limit) continue
        if (other < 0 || refinedDistance2[k]! < refinedDistance2[other]!) other = k
      }
      if (other >= 0) gridOther[cell] = refinedIndex[other]!
    }

  // A stretch's minimum can be too shallow for the stamps to show in one cell yet show in the next,
  // near the middle of a tight bend. So each cell also seeds from its neighbours' stretches, and
  // keeps whichever are really nearest at its own centre.
  const passGrid = grid.slice()
  const passOther = gridOther.slice()
  const seeds = new Int32Array(18)
  for (let gz = 0; gz < rows; gz++)
    for (let gx = 0; gx < columns; gx++) {
      const cell = gz * columns + gx
      if (passGrid[cell]! < 0) continue
      let count = 0
      for (let nz = Math.max(0, gz - 1); nz <= Math.min(rows - 1, gz + 1); nz++)
        for (let nx = Math.max(0, gx - 1); nx <= Math.min(columns - 1, gx + 1); nx++) {
          const neighbour = nz * columns + nx
          for (let pick = 0; pick < 2; pick++) {
            const seed = pick === 0 ? passGrid[neighbour]! : passOther[neighbour]!
            if (seed < 0) continue
            let known = false
            for (let k = 0; k < count && !known; k++) {
              known = indexGap(seeds[k]!, seed) <= SEPARATE_STRETCH
            }
            if (!known) seeds[count++] = seed
          }
        }
      if (count < 2) continue
      const centerX = minX + (gx + 0.5) * GRID_SIZE
      const centerZ = minZ + (gz + 0.5) * GRID_SIZE
      let bestIndex = -1
      let bestDistance2 = Infinity
      let otherIndex = -1
      let otherDistance2 = Infinity
      for (let k = 0; k < count; k++) {
        seek(seeds[k]!, STAMP_STRIDE, centerX, centerZ)
        const index = walked[0]!
        const distance2 = walked[1]!
        if (distance2 < bestDistance2) {
          if (bestIndex >= 0 && indexGap(index, bestIndex) > SEPARATE_STRETCH) {
            otherIndex = bestIndex
            otherDistance2 = bestDistance2
          }
          bestIndex = index
          bestDistance2 = distance2
        } else if (indexGap(index, bestIndex) > SEPARATE_STRETCH && distance2 < otherDistance2) {
          otherIndex = index
          otherDistance2 = distance2
        }
      }
      grid[cell] = bestIndex
      const keep =
        otherIndex >= 0 &&
        Math.sqrt(otherDistance2) <= Math.sqrt(bestDistance2) + cellSlack + RIVAL_BAND
      gridOther[cell] = keep ? otherIndex : -1
    }

  const tangentAt = (s: number): RouteTangent => {
    const a = pointAt(s - 0.5)
    const b = pointAt(s + 0.5)
    const magnitude = Math.hypot(b.x - a.x, b.z - a.z)
    return { x: (b.x - a.x) / magnitude, z: (b.z - a.z) / magnitude }
  }

  // The last grid query's point and, where its cell has another stretch, both stretches' nearest
  // samples: [x, z, first index (-1 if none), its distance², second index, its distance²].
  const lastQuery = new Float64Array([NaN, NaN, -1, 0, 0, 0])

  function nearest(x: number, z: number): NearestRoutePoint
  function nearest(x: number, z: number, maxDistance: number): NearestRoutePoint | null
  function nearest(x: number, z: number, maxDistance = Infinity): NearestRoutePoint | null {
    const gx = Math.floor((x - minX) / GRID_SIZE)
    const gz = Math.floor((z - minZ) / GRID_SIZE)
    const cell = gx >= 0 && gx < columns && gz >= 0 && gz < rows ? gz * columns + gx : -1
    let bestIndex = cell >= 0 ? grid[cell]! : -1
    let bestDistance2 = Infinity
    if (bestIndex >= 0) {
      seek(bestIndex, QUERY_JUMP, x, z)
      bestIndex = walked[0]!
      bestDistance2 = walked[1]!
      const other = gridOther[cell]!
      lastQuery[0] = x
      lastQuery[1] = z
      lastQuery[2] = -1
      if (other >= 0) {
        seek(other, QUERY_JUMP, x, z)
        // Both stretches, for a `rival` call about this same point.
        lastQuery[2] = bestIndex
        lastQuery[3] = bestDistance2
        lastQuery[4] = walked[0]!
        lastQuery[5] = walked[1]!
        if (walked[1]! < bestDistance2) {
          bestIndex = walked[0]!
          bestDistance2 = walked[1]!
        }
      }
    } else {
      if (maxDistance <= GRID_REACH) return null
      // Queries outside the grid are rare. A full scan keeps those exact.
      for (let index = 0; index < sampleCount; index++) {
        const distance2 = distance2To(index, x, z)
        if (distance2 < bestDistance2) {
          bestDistance2 = distance2
          bestIndex = index
        }
      }
    }
    return project(bestIndex, bestDistance2, x, z, maxDistance)
  }

  function rival(x: number, z: number, band: number): RivalRoutePoint | null {
    let firstIndex: number
    let firstDistance2: number
    let secondIndex: number
    let secondDistance2: number
    if (x === lastQuery[0] && z === lastQuery[1]) {
      // `nearest` just walked both stretches for this point.
      if (lastQuery[2]! < 0) return null
      firstIndex = lastQuery[2]!
      firstDistance2 = lastQuery[3]!
      secondIndex = lastQuery[4]!
      secondDistance2 = lastQuery[5]!
    } else {
      const gx = Math.floor((x - minX) / GRID_SIZE)
      const gz = Math.floor((z - minZ) / GRID_SIZE)
      if (gx < 0 || gx >= columns || gz < 0 || gz >= rows) return null
      const cell = gz * columns + gx
      const other = gridOther[cell]!
      if (other < 0) return null
      seek(grid[cell]!, QUERY_JUMP, x, z)
      firstIndex = walked[0]!
      firstDistance2 = walked[1]!
      seek(other, QUERY_JUMP, x, z)
      secondIndex = walked[0]!
      secondDistance2 = walked[1]!
    }
    const swap = secondDistance2 < firstDistance2
    const nearestIndex = swap ? secondIndex : firstIndex
    const nearer = Math.sqrt(swap ? secondDistance2 : firstDistance2)
    const rivalIndex = swap ? firstIndex : secondIndex
    const rivalDistance2 = swap ? firstDistance2 : secondDistance2
    const limit = Math.min(band, RIVAL_BAND)
    if (Math.sqrt(rivalDistance2) - nearer > limit) return null
    // The ridge between them: the lower of the furthest points either way round the loop. Past
    // `limit` above the rival the prominence no longer matters, so each way stops there.
    const cap = Math.sqrt(rivalDistance2) + limit
    const cap2 = cap * cap
    const ridgeOneWay = (direction: number): number => {
      let ridge2 = 0
      for (let i = wrap(nearestIndex + direction); i !== rivalIndex; i = wrap(i + direction)) {
        ridge2 = Math.max(ridge2, distance2To(i, x, z))
        if (ridge2 >= cap2) break
      }
      return ridge2
    }
    const ridge2 = Math.min(ridgeOneWay(1), ridgeOneWay(-1))
    const point = project(rivalIndex, rivalDistance2, x, z, Infinity)!
    return {
      ...point,
      prominence: Math.max(0, Math.sqrt(ridge2) - Math.abs(point.lateral)),
    }
  }

  /**
   * The nearest point to (x, z) on the polyline either side of sample `index`, which is
   * `distance2` from it. Null if that is more than `maxDistance` away.
   */
  function project(
    index: number,
    distance2: number,
    x: number,
    z: number,
    maxDistance: number,
  ): NearestRoutePoint | null {
    let bestDistance2 = distance2
    let bestS = sampleS[index]!
    let bestX = sampleX[index]!
    let bestZ = sampleZ[index]!
    let bestFloor = sampleFloor[index]!
    let bestWidth = sampleWidth[index]!
    let bestDx = 1
    let bestDz = 0
    // Refine against the two adjacent polyline segments.
    for (let offset = -1; offset <= 0; offset++) {
      const a = wrap(index + offset)
      const b = wrap(index + offset + 1)
      const ax = sampleX[a]!
      const az = sampleZ[a]!
      const dx = sampleX[b]! - ax
      const dz = sampleZ[b]! - az
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
      const projectedX = ax + dx * t
      const projectedZ = az + dz * t
      const deltaX = x - projectedX
      const deltaZ = z - projectedZ
      const segmentDistance2 = deltaX * deltaX + deltaZ * deltaZ
      if (segmentDistance2 <= bestDistance2) {
        bestDistance2 = segmentDistance2
        const segmentLength = b === 0 ? length - sampleS[a]! : sampleS[b]! - sampleS[a]!
        bestS = sampleS[a]! + segmentLength * t
        if (bestS >= length) bestS -= length
        bestX = projectedX
        bestZ = projectedZ
        bestFloor = mix(sampleFloor[a]!, sampleFloor[b]!, t)
        bestWidth = mix(sampleWidth[a]!, sampleWidth[b]!, t)
        bestDx = dx
        bestDz = dz
      }
    }
    if (bestDistance2 > maxDistance * maxDistance) return null
    const inverseMagnitude = 1 / Math.sqrt(bestDx * bestDx + bestDz * bestDz)
    const lateral =
      bestDx * inverseMagnitude * (z - bestZ) - bestDz * inverseMagnitude * (x - bestX)
    return {
      s: bestS,
      lateral,
      floorHeight: bestFloor,
      valleyWidth: bestWidth,
    }
  }

  return { length, pointAt, tangentAt, nearest, rival }
}

import { ROUTE_POINTS } from './routePoints'

export const ROUTE = createRoute(ROUTE_POINTS)
