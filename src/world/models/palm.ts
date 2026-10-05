import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { color } from '../../styles/tokens'

// The palm (#235): a curved trunk of five tapered segments crowned by seven drooping fronds, one
// unit model drawn as one `InstancedMesh` (`Foliage.tsx`). The trunk leans toward +X; an instance
// turns it to face the water with its yaw and adds a tilt for a harder lean. Each frond is a
// closed, shallow V-section strip bent over in the middle, so the inverted-hull outline has
// something to wrap, at 12 triangles a frond. A `foliageSway` attribute (0 at the foot, 1 at the
// frond tips) lets the vertex shader sway the crown with no per-frame work in JS.

const deg = (degrees: number): number => (degrees * Math.PI) / 180

/** m, height of the unit model along its trunk */
export const PALM_HEIGHT = 9
const TRUNK_SEGMENTS = 5
const TRUNK_SIDES = 5
const FRONDS = 7

/**
 * The three variants (#235), chosen per instance by the scatter: height as a scale of the unit
 * model and a lean added by the instance's tilt. The unit trunk already leans `PALM_BASE_LEAN`,
 * so the finished palms lean 10, 20 and 30 degrees.
 */
export const PALM_VARIANTS = [
  { scale: 0.85, tilt: deg(20) },
  { scale: 1, tilt: deg(10) },
  { scale: 1.2, tilt: 0 },
] as const

/** radians off vertical, the chord of the unit trunk from foot to crown (about; see the test) */
export const PALM_BASE_LEAN = deg(10)

interface Mesh {
  positions: number[]
  sway: number[]
}

/** Pushes a triangle wound outward from `inside`, so the toon side is the outside. */
function face(mesh: Mesh, inside: Vector3, a: Vector3, b: Vector3, c: Vector3, sway: number[]) {
  const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a))
  const middle = new Vector3().add(a).add(b).add(c).divideScalar(3).sub(inside)
  const flip = normal.dot(middle) < 0
  const [p, q, r] = flip ? [a, c, b] : [a, b, c]
  const [sp, sq, sr] = flip ? [sway[0], sway[2], sway[1]] : sway
  mesh.positions.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z)
  mesh.sway.push(sp ?? 0, sq ?? 0, sr ?? 0)
}

function finish(mesh: Mesh, tint: (normalY: number) => Color): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(mesh.positions), 3))
  geometry.computeVertexNormals()
  const normal = geometry.getAttribute('normal')
  const colors = new Float32Array(normal.count * 3)
  for (let i = 0; i < normal.count; i++) {
    const c = tint(normal.getY(i))
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('foliageSway', new BufferAttribute(new Float32Array(mesh.sway), 1))
  return geometry
}

/** The trunk's centreline, foot to crown, as a gentle arc that leans toward +X. */
function trunkPath(): Vector3[] {
  const path = [new Vector3(0, -1, 0), new Vector3(0, 0, 0)]
  const length = (PALM_HEIGHT - 0) / TRUNK_SEGMENTS
  // The tangent leans further off vertical toward the crown: 4 degrees at the foot to 16 at the top.
  for (let i = 0; i < TRUNK_SEGMENTS; i++) {
    const t = (i + 0.5) / TRUNK_SEGMENTS
    const angle = deg(4 + 12 * t)
    const last = path[path.length - 1]!
    path.push(new Vector3(last.x + Math.sin(angle) * length, last.y + Math.cos(angle) * length, 0))
  }
  return path
}

function trunkGeometry(path: readonly Vector3[]): BufferGeometry {
  const mesh: Mesh = { positions: [], sway: [] }
  // Rings from the buried foot (path[0], below ground) up the five segments.
  const rings: Vector3[][] = []
  const sways: number[] = []
  const radii = [0.5, 0.46, 0.4, 0.34, 0.3, 0.26, 0.22]
  path.forEach((point, i) => {
    const r = radii[i] ?? 0.22
    const ring: Vector3[] = []
    for (let s = 0; s < TRUNK_SIDES; s++) {
      const a = (s / TRUNK_SIDES) * Math.PI * 2
      ring.push(new Vector3(point.x + Math.cos(a) * r, point.y, point.z + Math.sin(a) * r))
    }
    rings.push(ring)
    const h = Math.max(0, point.y) / PALM_HEIGHT
    sways.push(0.3 * h * h)
  })
  for (let i = 0; i < rings.length - 1; i++) {
    const lower = rings[i]!
    const upper = rings[i + 1]!
    // Faces wind outward from the segment's own axis, so a leaning trunk stays outward.
    const centre = new Vector3().addVectors(path[i]!, path[i + 1]!).multiplyScalar(0.5)
    for (let s = 0; s < TRUNK_SIDES; s++) {
      const n = (s + 1) % TRUNK_SIDES
      const lo = sways[i]!
      const hi = sways[i + 1]!
      face(mesh, centre, lower[s]!, lower[n]!, upper[s]!, [lo, lo, hi])
      face(mesh, centre, lower[n]!, upper[n]!, upper[s]!, [lo, hi, hi])
    }
  }
  // A cap on the crown, hidden under the fronds, keeps the trunk closed for its outline.
  const top = rings[rings.length - 1]!
  const crown = path[path.length - 1]!
  const apex = new Vector3(crown.x, crown.y + 0.15, 0)
  const topSway = sways[sways.length - 1]!
  const under = new Vector3(crown.x, crown.y - 0.5, 0)
  for (let s = 0; s < TRUNK_SIDES; s++) {
    face(mesh, under, top[s]!, top[(s + 1) % TRUNK_SIDES]!, apex, [topSway, topSway, topSway])
  }
  const bark = new Color(color.bark)
  return finish(mesh, () => bark)
}

/** One frond: a closed V-section strip from the crown, rising, then drooping to a hanging tip. */
function frondGeometry(crown: Vector3, azimuth: number, scale: number): BufferGeometry {
  const mesh: Mesh = { positions: [], sway: [] }
  const out = new Vector3(Math.cos(azimuth), 0, Math.sin(azimuth))
  const side = new Vector3(-out.z, 0, out.x)
  const at = (forward: number, up: number) =>
    crown
      .clone()
      .addScaledVector(out, forward * scale)
      .add(new Vector3(0, up * scale, 0))
  const mid = at(2.3, 0.9)
  const far = at(4.4, -0.4)
  const tip = at(5.9, -2.3)
  const station = (centre: Vector3, half: number): Vector3[] => [
    centre.clone().addScaledVector(side, half),
    centre.clone().addScaledVector(side, -half),
    centre.clone().add(new Vector3(0, -0.2, 0)),
  ]
  const ringA = station(mid, 0.6 * scale)
  const ringB = station(far, 0.45 * scale)
  const base = crown.clone()
  // The crown's sway is the trunk's top, so the frond's foot moves with it.
  const swayFoot = 0.3
  const inside = new Vector3().add(base).add(mid).add(far).add(tip).divideScalar(4)
  const a = [swayFoot, 0.6, 0.6]
  const b = [0.6, 0.85, 0.85]
  for (let s = 0; s < 3; s++) {
    const n = (s + 1) % 3
    face(mesh, inside, base, ringA[s]!, ringA[n]!, [swayFoot, a[1]!, a[1]!])
    face(mesh, inside, ringA[s]!, ringB[s]!, ringB[n]!, [a[1]!, b[0]!, b[0]!])
    face(mesh, inside, ringA[s]!, ringB[n]!, ringA[n]!, [a[1]!, b[0]!, a[1]!])
    face(mesh, inside, ringB[s]!, tip, ringB[n]!, [b[0]!, 1, b[0]!])
  }
  const dark = new Color(color.foliage)
  const light = new Color(color.foliageLight)
  const mixed = new Color()
  return finish(mesh, (normalY) => {
    const t = Math.min(1, Math.max(0, (normalY - 0.1) / 0.8))
    return mixed
      .copy(dark)
      .lerp(light, t * t * (3 - 2 * t))
      .clone()
  })
}

/** A body to draw and the smoothed-normal copy its outline hull draws, as for the other foliage. */
export interface PalmModel {
  body: BufferGeometry
  hull: BufferGeometry
}

/** The unit palm, 9 m tall along its trunk, at most 150 triangles. */
export function buildPalm(): PalmModel {
  const path = trunkPath()
  const crown = path[path.length - 1]!.clone()
  const parts: BufferGeometry[] = [trunkGeometry(path)]
  for (let i = 0; i < FRONDS; i++) {
    // Spread round the crown, with a little unevenness and a mix of lengths.
    const azimuth = (i / FRONDS) * Math.PI * 2 + 0.35 * Math.sin(i * 2.1)
    parts.push(frondGeometry(crown.clone().add(new Vector3(0, 0.1, 0)), azimuth, i % 2 ? 0.85 : 1))
  }
  const body = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  if (!body) throw new Error('palm parts have mismatched attributes')
  body.computeBoundingSphere()
  const hull = toCreasedNormals(body, Math.PI)
  return { body, hull }
}
