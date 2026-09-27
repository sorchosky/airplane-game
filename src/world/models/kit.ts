import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
  type BoxGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// A tiny kit for procedural low-poly landmark models (#76). Every part ends up non-indexed with
// `position`, `normal` and a linear `color` attribute, so a whole landmark (and all five of them)
// merges into one geometry: one toon draw and one outline draw.

/**
 * Height of the ground under a point of a model, relative to the model's origin, in the model's
 * own frame (x right, z forward = -Z). Parts that span uneven ground sit on it with this.
 */
export type LocalGround = (x: number, z: number) => number

export const flatGround: LocalGround = () => 0

/** Mulberry32: small seeded PRNG, so a model's "random" details are the same every load. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface PartOptions {
  color: string
  position?: readonly [number, number, number]
  /** Euler angles, radians, XYZ order */
  rotation?: readonly [number, number, number]
  scale?: readonly [number, number, number]
  /**
   * m, how far each vertex is nudged at random, for hand-cut stone. Keyed on the vertex position,
   * so vertices a seam shares move together and no cracks open.
   */
  jitter?: number
  seed?: number
  /** Smooth normals (foliage) instead of flat facets (stone, bark). */
  smooth?: boolean
}

function hashPosition(x: number, y: number, z: number, seed: number): number {
  // Round to centimetres so the two copies of a seam vertex hash the same.
  let h = seed ^ 0x9e3779b9
  for (const v of [Math.round(x * 100), Math.round(y * 100), Math.round(z * 100)]) {
    h = Math.imul(h ^ v, 0x85ebca6b)
    h ^= h >>> 13
  }
  return h >>> 0
}

function jitterVertices(geometry: BufferGeometry, amount: number, seed: number): void {
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const random = seededRandom(hashPosition(x, y, z, seed))
    position.setXYZ(
      i,
      x + (random() * 2 - 1) * amount,
      y + (random() * 2 - 1) * amount,
      z + (random() * 2 - 1) * amount,
    )
  }
}

/** Finishes a raw geometry into a mergeable part: transform, jitter, normals, colour. */
export function part(source: BufferGeometry, options: PartOptions): BufferGeometry {
  let geometry: BufferGeometry = source
  geometry.deleteAttribute('uv')
  const matrix = new Matrix4().compose(
    new Vector3(...(options.position ?? [0, 0, 0])),
    new Quaternion().setFromEuler(new Euler(...(options.rotation ?? [0, 0, 0]))),
    new Vector3(...(options.scale ?? [1, 1, 1])),
  )
  geometry.applyMatrix4(matrix)
  if (options.jitter) jitterVertices(geometry, options.jitter, options.seed ?? 1)
  if (options.smooth) {
    geometry.computeVertexNormals()
    geometry = geometry.index ? geometry.toNonIndexed() : geometry
  } else {
    geometry = geometry.index ? geometry.toNonIndexed() : geometry
    geometry.deleteAttribute('normal')
    geometry.computeVertexNormals()
  }
  if (geometry !== source) source.dispose()
  const c = new Color(options.color)
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

export interface PrismOptions extends PartOptions {
  radiusTop: number
  radiusBottom: number
  /** m, bottom and top of the prism along its own axis */
  bottom: number
  top: number
  sides: number
  /** radians, turns the prism about its axis so flat faces, not corners, can face front */
  twist?: number
}

/** An n-sided tapered prism (a low-poly cylinder), standing on its axis. */
export function prism(options: PrismOptions): BufferGeometry {
  const height = options.top - options.bottom
  const geometry = new CylinderGeometry(
    options.radiusTop,
    options.radiusBottom,
    height,
    options.sides,
    1,
    false,
    options.twist ?? 0,
  )
  geometry.translate(0, options.bottom + height / 2, 0)
  return part(geometry, options)
}

export interface BlobOptions extends PartOptions {
  radius: number
  /** 0 = 20 faces, 1 = 80 faces */
  detail?: 0 | 1
}

/** A low-poly ball: canopy clumps, moss, mist. */
export function blob(options: BlobOptions): BufferGeometry {
  return part(new IcosahedronGeometry(options.radius, options.detail ?? 1), options)
}

/** A box part, from a `BoxGeometry` so callers pick the size. */
export function block(geometry: BoxGeometry, options: PartOptions): BufferGeometry {
  return part(geometry, options)
}

/**
 * A tube swept along `path` with an n-sided cross-section of `radius[i]` at each point: arches,
 * branches. The cross-section is stretched by `depthScale` along the path's binormal (local Z for
 * a path in the XY plane), which makes a rock arch a deep slab rather than a pipe.
 */
export function sweep(
  path: readonly Vector3[],
  radius: readonly number[],
  sides: number,
  options: PartOptions & { depthScale?: number; up?: Vector3 },
): BufferGeometry {
  const up = options.up ?? new Vector3(0, 0, 1)
  const depthScale = options.depthScale ?? 1
  const positions: number[] = []
  const indices: number[] = []
  const tangent = new Vector3()
  const normal = new Vector3()
  const binormal = new Vector3()
  path.forEach((point, i) => {
    const prev = path[Math.max(0, i - 1)] ?? point
    const next = path[Math.min(path.length - 1, i + 1)] ?? point
    tangent.subVectors(next, prev).normalize()
    binormal.copy(up).addScaledVector(tangent, -up.dot(tangent)).normalize()
    normal.crossVectors(binormal, tangent).normalize()
    const r = radius[i] ?? radius[radius.length - 1] ?? 1
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2
      const a = Math.cos(angle) * r
      const b = Math.sin(angle) * r * depthScale
      positions.push(
        point.x + normal.x * a + binormal.x * b,
        point.y + normal.y * a + binormal.y * b,
        point.z + normal.z * a + binormal.z * b,
      )
    }
  })
  for (let i = 0; i < path.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = i * sides + s
      const b = i * sides + ((s + 1) % sides)
      const c = (i + 1) * sides + s
      const d = (i + 1) * sides + ((s + 1) % sides)
      indices.push(a, b, c, b, d, c)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(indices)
  return part(geometry, options)
}

/** Merges finished parts into one geometry and frees the parts. */
export function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  if (!merged) throw new Error('landmark parts have mismatched attributes')
  return merged
}
