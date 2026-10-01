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
  nearest(x: number, z: number): NearestRoutePoint
}

interface Sample extends RoutePoint {
  readonly s: number
}

const LOOKUP_STEPS_PER_POINT = 64
const NEAREST_SPACING = 2
const GRID_SIZE = 8
const GRID_PADDING = 3

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
  const samples: Sample[] = Array.from({ length: sampleCount }, (_, i) => ({
    ...pointAt((i * length) / sampleCount),
    s: (i * length) / sampleCount,
  }))
  const minX = Math.min(...samples.map((p) => p.x)) - GRID_SIZE
  const minZ = Math.min(...samples.map((p) => p.z)) - GRID_SIZE
  const columns = Math.ceil((Math.max(...samples.map((p) => p.x)) - minX) / GRID_SIZE) + 2
  const rows = Math.ceil((Math.max(...samples.map((p) => p.z)) - minZ) / GRID_SIZE) + 2
  const grid: number[][] = Array.from({ length: columns * rows }, () => [])
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!
    const cellX = Math.floor((p.x - minX) / GRID_SIZE)
    const cellZ = Math.floor((p.z - minZ) / GRID_SIZE)
    // Include the neighbouring cells so the common near-route query needs one lookup.
    for (let dz = -GRID_PADDING; dz <= GRID_PADDING; dz++)
      for (let dx = -GRID_PADDING; dx <= GRID_PADDING; dx++) {
        const gx = cellX + dx
        const gz = cellZ + dz
        if (gx >= 0 && gx < columns && gz >= 0 && gz < rows) grid[gz * columns + gx]!.push(i)
      }
  }
  const fastGrid = new Int32Array(grid.length)
  fastGrid.fill(-1)
  for (let cell = 0; cell < grid.length; cell++) {
    const candidates = grid[cell]!
    // A cell at the loop seam (or a future self-approach) needs all candidates.
    let minCandidate = sampleCount
    let maxCandidate = 0
    for (const index of candidates) {
      minCandidate = Math.min(minCandidate, index)
      maxCandidate = Math.max(maxCandidate, index)
    }
    if (
      candidates.length > ((GRID_PADDING * 2 + 1) * GRID_SIZE) / NEAREST_SPACING + 8 ||
      maxCandidate - minCandidate > sampleCount / 2
    )
      continue
    const centerX = minX + ((cell % columns) + 0.5) * GRID_SIZE
    const centerZ = minZ + (Math.floor(cell / columns) + 0.5) * GRID_SIZE
    let closestDistance = Infinity
    for (const index of candidates) {
      const point = samples[index]!
      const distance = (point.x - centerX) ** 2 + (point.z - centerZ) ** 2
      if (distance < closestDistance) {
        fastGrid[cell] = index
        closestDistance = distance
      }
    }
  }

  const tangentAt = (s: number): RouteTangent => {
    const a = pointAt(s - 0.5)
    const b = pointAt(s + 0.5)
    const magnitude = Math.hypot(b.x - a.x, b.z - a.z)
    return { x: (b.x - a.x) / magnitude, z: (b.z - a.z) / magnitude }
  }

  const nearest = (x: number, z: number): NearestRoutePoint => {
    const centerX = Math.max(0, Math.min(columns - 1, Math.floor((x - minX) / GRID_SIZE)))
    const centerZ = Math.max(0, Math.min(rows - 1, Math.floor((z - minZ) / GRID_SIZE)))
    const fastIndex = fastGrid[centerZ * columns + centerX]!
    let bestIndex = fastIndex
    let bestDistance2 = Infinity
    if (fastIndex >= 0) {
      for (let offset = -6; offset <= 6; offset++) {
        let index = fastIndex + offset
        if (index < 0) index += sampleCount
        else if (index >= sampleCount) index -= sampleCount
        const point = samples[index]!
        const deltaX = x - point.x
        const deltaZ = z - point.z
        const distance2 = deltaX * deltaX + deltaZ * deltaZ
        if (distance2 < bestDistance2) {
          bestDistance2 = distance2
          bestIndex = index
        }
      }
      if (bestDistance2 > ((GRID_PADDING + 1) * GRID_SIZE) ** 2) bestIndex = -1
    }
    // Queries outside the populated corridor are rare. A full scan keeps those exact while
    // near-route terrain queries take the constant-time grid path above.
    if (bestIndex < 0) {
      bestDistance2 = Infinity
      for (let index = 0; index < sampleCount; index++) {
        const point = samples[index]!
        const deltaX = x - point.x
        const deltaZ = z - point.z
        const distance2 = deltaX * deltaX + deltaZ * deltaZ
        if (distance2 < bestDistance2) {
          bestDistance2 = distance2
          bestIndex = index
        }
      }
    }
    const center = samples[bestIndex]!
    let bestS = center.s
    let bestX = center.x
    let bestZ = center.z
    let bestFloor = center.floorHeight
    let bestWidth = center.valleyWidth
    let bestDx = 1
    let bestDz = 0
    // Refine against the two adjacent polyline segments.
    for (let offset = -1; offset <= 0; offset++) {
      const a = samples[(bestIndex + offset + sampleCount) % sampleCount]!
      const bIndex = (bestIndex + offset + 1 + sampleCount) % sampleCount
      const b = samples[bIndex]!
      const dx = b.x - a.x
      const dz = b.z - a.z
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)))
      const projectedX = mix(a.x, b.x, t)
      const projectedZ = mix(a.z, b.z, t)
      const deltaX = x - projectedX
      const deltaZ = z - projectedZ
      const distance2 = deltaX * deltaX + deltaZ * deltaZ
      if (distance2 <= bestDistance2) {
        bestDistance2 = distance2
        const segmentLength = bIndex === 0 ? length - a.s : b.s - a.s
        bestS = (a.s + segmentLength * t) % length
        bestX = projectedX
        bestZ = projectedZ
        bestFloor = mix(a.floorHeight, b.floorHeight, t)
        bestWidth = mix(a.valleyWidth, b.valleyWidth, t)
        bestDx = dx
        bestDz = dz
      }
    }
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

  return { length, pointAt, tangentAt, nearest }
}

import { ROUTE_POINTS } from './routePoints'

export const ROUTE = createRoute(ROUTE_POINTS)
