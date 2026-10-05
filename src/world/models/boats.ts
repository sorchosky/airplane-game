import { BoxGeometry, BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { color } from '../../styles/tokens'
import { type Boat, type HullTone, FISHING_BEAM, SAIL_BEAM } from '../boatPlan'
import { block, mergeParts, part, prism } from './kit'

// Boats (#225): a fishing boat (hull, wheelhouse, mast with a boom) and a sailboat (hull, mast,
// mainsail and jib) from the landmark kit's parts. Each boat is modelled in its own frame, origin
// at the waterline amidships, bow on -Z, +X to starboard, and carries three constant per-vertex
// attributes that the vertex shader (`landmarkMaterials.withBoatMotion`) turns into its place in
// the world and its motion, so moving them costs one time uniform and no JS per frame:
//   boatLoop  vec4  (cx, cz, rx, rz) m in the town's frame; rx = 0 for a moored boat, at (cx, cz)
//   boatRun   vec4  (phase 0..1, loops/s signed, loop start 0..1, moored yaw radians)
//   boatSail  float 0..1, how far the vertex follows the sails' sway (the free edge of a sail)

/** Triangles of a boat part, in the boat's frame. */
type Triangle = readonly [Vector3, Vector3, Vector3]

interface Tag {
  loop: readonly [number, number, number, number]
  run: readonly [number, number, number, number]
}

/** Freeboard above the waterline, m. */
const DECK = 0.9
/** m, the wheelhouse's floor stands this far above the waterline. */
const CABIN_FLOOR = DECK

function tagged(geometry: BufferGeometry, tag: Tag, sail?: Float32Array): BufferGeometry {
  const count = geometry.getAttribute('position').count
  const loop = new Float32Array(count * 4)
  const run = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    loop.set(tag.loop, i * 4)
    run.set(tag.run, i * 4)
  }
  geometry.setAttribute('boatLoop', new BufferAttribute(loop, 4))
  geometry.setAttribute('boatRun', new BufferAttribute(run, 4))
  geometry.setAttribute('boatSail', new BufferAttribute(sail ?? new Float32Array(count), 1))
  return geometry
}

/**
 * A mergeable part from triangles in any winding: each is turned to face away from `centre`, so a
 * convex-ish solid needs no hand-checked winding. Zero-area triangles (a hull's pointed bow) go.
 */
function solid(
  triangles: readonly Triangle[],
  centre: Vector3,
  options: { color: string; glow?: number },
  weights?: readonly (readonly [number, number, number])[],
): { geometry: BufferGeometry; sail: Float32Array } {
  const positions: number[] = []
  const sail: number[] = []
  const edge1 = new Vector3()
  const edge2 = new Vector3()
  const normal = new Vector3()
  const middle = new Vector3()
  triangles.forEach(([a, b, c], index) => {
    normal.crossVectors(edge1.subVectors(b, a), edge2.subVectors(c, a))
    if (normal.lengthSq() < 1e-10) return
    middle.copy(a).add(b).add(c).divideScalar(3).sub(centre)
    const flip = normal.dot(middle) < 0
    const order = flip ? [a, c, b] : [a, b, c]
    const w = weights?.[index] ?? [0, 0, 0]
    const ordered = flip ? [w[0], w[2], w[1]] : [w[0], w[1], w[2]]
    for (const p of order) positions.push(p.x, p.y, p.z)
    sail.push(...ordered)
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return { geometry: part(geometry, options), sail: new Float32Array(sail) }
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z)

/** Stations of the hull from bow to stern: share of the length, half-beam share, keel depth m. */
const STATIONS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0.1],
  [0.12, 0.55, 0.3],
  [0.35, 0.93, 0.5],
  [0.6, 1, 0.5],
  [0.85, 0.92, 0.42],
  [1, 0.8, 0.36],
]

/** The hull: a lofted shell with a sheer that rises to the bow, plus its deck. */
function hullParts(length: number, beam: number, tone: HullTone, tag: Tag): BufferGeometry[] {
  const rings = STATIONS.map(([t, half, keel]) => {
    const z = -length / 2 + t * length
    const w = (beam / 2) * half
    // The sheer lifts toward the bow so a boat reads from the side.
    const deck = DECK + 0.45 * (1 - t) ** 2
    return [
      v(-w, deck, z),
      v(-w * 0.8, -keel * 0.55, z),
      v(0, -keel, z),
      v(w * 0.8, -keel * 0.55, z),
      v(w, deck, z),
    ]
  })
  const centre = v(0, 0.1, 0)
  const side: Triangle[] = []
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i]
    const b = rings[i + 1]
    if (!a || !b) continue
    for (let k = 0; k < 4; k++) {
      side.push([a[k]!, a[k + 1]!, b[k]!], [a[k + 1]!, b[k + 1]!, b[k]!])
    }
  }
  const stern = rings[rings.length - 1]!
  side.push(
    [stern[0]!, stern[1]!, stern[2]!],
    [stern[0]!, stern[2]!, stern[3]!],
    [stern[0]!, stern[3]!, stern[4]!],
  )
  const topside: Triangle[] = []
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i]!
    const b = rings[i + 1]!
    topside.push([a[0]!, b[0]!, a[4]!], [a[4]!, b[0]!, b[4]!])
  }
  const hull = solid(side, centre, { color: color[tone] })
  const deckPart = solid(topside, v(0, -2, 0), { color: color.deckPlank })
  return [tagged(hull.geometry, tag), tagged(deckPart.geometry, tag)]
}

/** A thin straight spar or mast: a box along `from` to `to` (axis-aligned). */
function spar(from: Vector3, to: Vector3, size: number, tone: string, tag: Tag): BufferGeometry {
  const mid = from.clone().add(to).multiplyScalar(0.5)
  const d = to.clone().sub(from)
  return tagged(
    block(
      new BoxGeometry(
        Math.max(size, Math.abs(d.x)),
        Math.max(size, Math.abs(d.y)),
        Math.max(size, Math.abs(d.z)),
      ),
      {
        color: tone,
        position: [mid.x, mid.y, mid.z],
      },
    ),
    tag,
  )
}

/**
 * A sail: a thin triangular slab (`thickness` m) with a belly, so its outline hull has something
 * to inflate. Its corners are (head, tack, clew); the luff (head to tack) stays on the mast and
 * the middle and clew follow the sway.
 */
function sail(
  head: Vector3,
  tack: Vector3,
  clew: Vector3,
  belly: number,
  tag: Tag,
): BufferGeometry {
  const thickness = 0.07
  const middle = head.clone().add(tack).add(clew).divideScalar(3)
  middle.x += belly
  const corners = [head, tack, clew]
  const weights = [0, 0, 1]
  const front = (p: Vector3) => p.clone().add(v(thickness / 2, 0, 0))
  const back = (p: Vector3) => p.clone().sub(v(thickness / 2, 0, 0))
  const triangles: Triangle[] = []
  const w: [number, number, number][] = []
  for (const face of [front, back]) {
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3
      triangles.push([face(corners[i]!), face(corners[j]!), face(middle)])
      w.push([weights[i]!, weights[j]!, 1])
    }
  }
  // The rim between the faces closes the slab.
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3
    const a = corners[i]!
    const b = corners[j]!
    triangles.push([front(a), front(b), back(a)], [front(b), back(b), back(a)])
    w.push([weights[i]!, weights[j]!, weights[i]!], [weights[j]!, weights[j]!, weights[i]!])
  }
  const model = solid(triangles, middle.clone(), { color: color.snow }, w)
  return tagged(model.geometry, tag, model.sail)
}

/** A fishing boat: hull, a small wheelhouse aft with a lit window band, and a mast with a boom. */
export function buildFishingBoat(
  length: number,
  hull: HullTone,
  tag: Tag,
  roof: string = color.roofSlate,
): BufferGeometry {
  const half = length / 2
  const floor = CABIN_FLOOR
  const house = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    tone: string,
    glow = 0,
  ) => tagged(block(new BoxGeometry(w, h, d), { color: tone, position: [x, y, z], glow }), tag)
  const cabinZ = half - 2.2
  return mergeParts([
    ...hullParts(length, FISHING_BEAM, hull, tag),
    house(0, floor + 0.8, cabinZ, 1.9, 1.6, 2.2, color.wallLime),
    house(0, floor + 1.7, cabinZ, 2.4, 0.16, 2.7, roof),
    // Windows: a front band and one on each side, warm at night.
    house(0, floor + 1.05, cabinZ - 1.12, 1.5, 0.5, 0.06, color.windowGlass, 1),
    house(-0.97, floor + 1.05, cabinZ, 0.06, 0.5, 1.2, color.windowGlass, 1),
    house(0.97, floor + 1.05, cabinZ, 0.06, 0.5, 1.2, color.windowGlass, 1),
    tagged(
      prism({
        radiusTop: 0.07,
        radiusBottom: 0.1,
        bottom: floor,
        top: floor + 4.2,
        sides: 5,
        color: color.timber,
        position: [0, 0, -half + 2],
      }),
      tag,
    ),
    spar(v(0, floor + 2.6, -half + 2), v(0, floor + 2.6, -half + 3.8), 0.1, color.timber, tag),
  ])
}

/** A sailboat: hull, a mast, a boom, a white mainsail abaft the mast and a jib forward of it. */
export function buildSailboat(length: number, hull: HullTone, tag: Tag): BufferGeometry {
  const half = length / 2
  const mastZ = -half * 0.2
  const top = DECK + 9.4
  return mergeParts([
    ...hullParts(length, SAIL_BEAM, hull, tag),
    tagged(
      prism({
        radiusTop: 0.06,
        radiusBottom: 0.1,
        bottom: DECK,
        top,
        sides: 5,
        color: color.timber,
        position: [0, 0, mastZ],
      }),
      tag,
    ),
    spar(v(0, DECK + 1.1, mastZ), v(0, DECK + 1.1, half - 0.7), 0.09, color.timber, tag),
    sail(
      v(0, top - 0.3, mastZ + 0.1),
      v(0, DECK + 1.2, mastZ + 0.1),
      v(0, DECK + 1.2, half - 0.8),
      0.28,
      tag,
    ),
    sail(
      v(0, top - 1.2, mastZ - 0.1),
      v(0, DECK + 0.5, -half + 0.4),
      v(0, DECK + 1.3, mastZ - 0.1),
      0.2,
      tag,
    ),
  ])
}

/** Every boat in the plan merged into one geometry, each in its own frame and tagged. */
export function buildBoats(boats: readonly Boat[]): BufferGeometry {
  return mergeParts(
    boats.map((boat) => {
      if (boat.kind === 'fishing') {
        const tag: Tag = { loop: [boat.x, boat.z, 0, 0], run: [boat.phase, 0, 0, boat.yaw] }
        return buildFishingBoat(boat.length, boat.hull, tag)
      }
      const { cx, cz, rx, rz, cycles, start } = boat.loop
      return buildSailboat(boat.length, boat.hull, {
        loop: [cx, cz, rx, rz],
        run: [boat.phase, cycles, start, 0],
      })
    }),
  )
}
