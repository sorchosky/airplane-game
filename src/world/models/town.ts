import { BoxGeometry, BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three'
import { color } from '../../styles/tokens'
import {
  DOOR_OFFSET,
  ridgeHeight,
  type TownGround,
  type TownHouse,
  type TownLayout,
  type TownPier,
  type TownRoad,
} from '../townLayout'
import { block, mergeParts, part, prism } from './kit'

// The fishing town (#224): whitewashed timber-framed houses with steep gable roofs and deep eaves,
// a pier on pilings, a net rack, crates and barrels, and a lighthouse on the point. One merged
// geometry in the town's frame (origin at the pad's centre, x east to the sea, z south), added to
// the landmarks' single toon draw and outline draw. Windows and the lantern carry the `glow` mask.

const ROOF = { terracotta: color.roofTerracotta, slate: color.roofSlate } as const
/** m, how far the eaves reach past the wall, and the roof slab's thickness */
const EAVE = 0.9
const SLAB = 0.28

/** A solid triangular prism along x with its apex up: the gable's fill between the roof slabs. */
export function gableFill(
  halfWidth: number,
  rise: number,
  length: number,
  tint: string,
): BufferGeometry {
  const hx = length / 2
  const corners = [
    new Vector3(-hx, 0, -halfWidth),
    new Vector3(-hx, 0, halfWidth),
    new Vector3(-hx, rise, 0),
    new Vector3(hx, 0, -halfWidth),
    new Vector3(hx, 0, halfWidth),
    new Vector3(hx, rise, 0),
  ]
  const faces = [
    [0, 2, 1],
    [3, 4, 5],
    [0, 1, 4],
    [0, 4, 3],
    [0, 3, 5],
    [0, 5, 2],
    [1, 2, 5],
    [1, 5, 4],
  ] as const
  const inside = new Vector3(0, rise / 3, 0)
  const positions: number[] = []
  for (const [a, b, c] of faces) {
    const va = corners[a]!
    let vb = corners[b]!
    let vc = corners[c]!
    const normal = new Vector3().subVectors(vb, va).cross(new Vector3().subVectors(vc, va))
    const middle = new Vector3().add(va).add(vb).add(vc).divideScalar(3).sub(inside)
    // Wind every face outward, so the toon side is the outside.
    if (normal.dot(middle) < 0) [vb, vc] = [vc, vb]
    positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return part(geometry, { color: tint })
}

/** A window pane that glows at night, standing proud of a wall facing `rotation` about Y. */
function window(
  x: number,
  y: number,
  z: number,
  rotation: number,
  w = 0.9,
  h = 1.1,
): BufferGeometry {
  return block(new BoxGeometry(w, h, 0.2), {
    color: color.windowGlass,
    position: [x, y, z],
    rotation: [0, rotation, 0],
    glow: 1,
  })
}

/** A square piling from `top` down to `bottom`, pale at the top as weathered timber. */
function piling(x: number, z: number, top: number, bottom: number): BufferGeometry {
  return prism({
    color: color.timber,
    radiusTop: 0.3,
    radiusBottom: 0.34,
    bottom: Math.min(bottom, top - 0.6),
    top,
    sides: 4,
    twist: Math.PI / 4,
    position: [x, 0, z],
  })
}

/** Lowest and highest ground under a house's footprint, sampled at its corners and mid-points. */
function groundUnder(house: TownHouse, ground: TownGround): { min: number; max: number } {
  const cos = Math.cos(house.yaw)
  const sin = Math.sin(house.yaw)
  let min = Infinity
  let max = -Infinity
  for (const u of [-0.5, 0, 0.5]) {
    for (const v of [-0.5, 0, 0.5]) {
      const lx = u * house.length
      const lz = v * house.width
      const g = ground(house.x + lx * cos + lz * sin, house.z - lx * sin + lz * cos)
      min = Math.min(min, g)
      max = Math.max(max, g)
    }
  }
  return { min, max }
}

function houseParts(house: TownHouse, ground: TownGround, floor: number): BufferGeometry[] {
  const { length: L, width: W, wallHeight: H, pitch } = house
  const hw = W / 2
  const rise = hw * Math.tan(pitch)
  const wall = color.wallLime
  const roof = ROOF[house.roof]
  const boathouse = house.variant === 'boathouse'
  const parts: BufferGeometry[] = []
  const under = groundUnder(house, ground)

  if (boathouse) {
    // Astride the waterline on a deck: piles at the corners and along the sides, down to the bed.
    parts.push(
      block(new BoxGeometry(L + 0.8, 0.45, W + 0.8), {
        color: color.pierGrey,
        position: [0, -0.22, 0],
      }),
    )
    const cos = Math.cos(house.yaw)
    const sin = Math.sin(house.yaw)
    for (const u of [-0.5, 0, 0.5]) {
      for (const v of [-0.5, 0.5]) {
        const lx = u * L
        const lz = v * (W + 0.4)
        const bed = ground(house.x + lx * cos + lz * sin, house.z - lx * sin + lz * cos)
        parts.push(piling(lx, lz, -0.3, bed - floor - 0.8))
      }
    }
    // The slipway: a ramp from the water door down into the water.
    const drop = floor - (under.min + 0.5)
    const ramp = Math.hypot(8, Math.max(0.5, drop))
    parts.push(
      block(new BoxGeometry(ramp, 0.3, 3.6), {
        color: color.pierGrey,
        position: [L / 2 + 4, -Math.max(0.5, drop) / 2, 0],
        rotation: [0, 0, -Math.atan2(Math.max(0.5, drop), 8)],
      }),
    )
  } else {
    // A plinth that reaches the lowest ground under the footprint: no floating corner.
    const depth = floor - under.min + 1.2
    parts.push(
      block(new BoxGeometry(L + 0.4, depth + 0.5, W + 0.4), {
        color: color.timber,
        position: [0, 0.5 - (depth + 0.5) / 2, 0],
      }),
    )
  }

  // Walls, timber corner posts, a plate under the eaves, and a belt course on the two-storey.
  parts.push(block(new BoxGeometry(L, H, W), { color: wall, position: [0, H / 2, 0] }))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        block(new BoxGeometry(0.4, H, 0.4), {
          color: color.timber,
          position: [(sx * L) / 2, H / 2, (sz * W) / 2],
        }),
      )
    }
  }
  parts.push(
    block(new BoxGeometry(L + 0.2, 0.3, W + 0.2), {
      color: color.timber,
      position: [0, H - 0.15, 0],
    }),
  )
  if (house.variant === 'twoStorey') {
    parts.push(
      block(new BoxGeometry(L + 0.2, 0.3, W + 0.2), {
        color: color.timber,
        position: [0, H * 0.5, 0],
      }),
    )
  }

  // Doors and windows. Houses front onto +z; the boathouse's water door is its +x gable.
  const wz = hw + 0.04
  const wx = L / 2 + 0.04
  if (boathouse) {
    parts.push(
      block(new BoxGeometry(0.3, 2.8, 3.4), { color: color.timber, position: [wx, 1.4, 0] }),
      window(-L * 0.18, 1.7, wz, 0),
      window(L * 0.18, 1.7, wz, 0),
      window(-L * 0.18, 1.7, -wz, Math.PI),
      window(L * 0.18, 1.7, -wz, Math.PI),
    )
  } else {
    parts.push(
      block(new BoxGeometry(1.1, 2.0, 0.3), {
        color: color.timber,
        position: [DOOR_OFFSET * L, 1, wz],
      }),
      window(L * 0.24, 1.6, wz, 0),
      window(-L * 0.36, 1.6, wz, 0),
      window(-L * 0.25, 1.6, -wz, Math.PI),
      window(L * 0.25, 1.6, -wz, Math.PI),
      window(0, 1.6, W * 0, Math.PI / 2, 0.9, 1.1).translate(wx, 0, 0),
      window(0, 1.6, W * 0, -Math.PI / 2, 0.9, 1.1).translate(-wx, 0, 0),
    )
    if (house.variant === 'twoStorey') {
      parts.push(
        window(L * 0.24, H * 0.5 + 1.8, wz, 0),
        window(-L * 0.14, H * 0.5 + 1.8, wz, 0),
        window(-L * 0.36, H * 0.5 + 1.8, wz, 0),
        window(-L * 0.25, H * 0.5 + 1.8, -wz, Math.PI),
        window(L * 0.25, H * 0.5 + 1.8, -wz, Math.PI),
      )
    }
  }

  // The roof: a wall-coloured gable between two slabs, with deep eaves on every side.
  parts.push(gableFill(hw, rise, L, wall).translate(0, H, 0))
  const run = hw + EAVE
  const slabLength = run / Math.cos(pitch) + 0.15
  const ridge = H + rise
  for (const side of [-1, 1]) {
    // The slab's top face runs through the ridge; its centre sits half its length down the slope.
    const centreZ =
      (side * run) / 2 - side * 0.075 * Math.cos(pitch) + side * Math.sin(pitch) * (SLAB / 2)
    const centreY =
      ridge - (run * Math.tan(pitch)) / 2 + 0.075 * Math.sin(pitch) + Math.cos(pitch) * (SLAB / 2)
    parts.push(
      block(new BoxGeometry(L + 2 * EAVE, SLAB, slabLength), {
        color: roof,
        position: [0, centreY, centreZ],
        rotation: [side * pitch, 0, 0],
      }),
    )
  }

  if (house.chimney) {
    const cz = -hw * 0.4
    const cx = L * 0.3
    const base = ridge - Math.abs(cz) * Math.tan(pitch) - 0.5
    const top = ridge + 1.2
    parts.push(
      block(new BoxGeometry(0.95, top - base, 0.95), {
        color: color.rock,
        position: [cx, (top + base) / 2, cz],
      }),
      block(new BoxGeometry(1.25, 0.25, 1.25), {
        color: color.rockShadow,
        position: [cx, top + 0.1, cz],
      }),
    )
  }
  return parts
}

function placeHouse(house: TownHouse, ground: TownGround, layout: TownLayout): BufferGeometry[] {
  const under = groundUnder(house, ground)
  // Houses stand a step above the highest ground under them; the boathouse sits at the pier's deck.
  const floor = house.variant === 'boathouse' ? layout.pier.deckHeight : under.max + 0.3
  const matrix = new Matrix4().makeRotationY(house.yaw).setPosition(house.x, floor, house.z)
  return houseParts(house, ground, floor).map((geometry) => geometry.applyMatrix4(matrix))
}

function deckParts(
  pier: TownPier,
  fingers: TownLayout['fingers'],
  ground: TownGround,
): BufferGeometry[] {
  const deck = pier.deckHeight
  const parts: BufferGeometry[] = []
  const slab = (x0: number, x1: number, z0: number, z1: number, y: number) =>
    block(new BoxGeometry(x1 - x0, 0.35, z1 - z0), {
      color: color.pierGrey,
      position: [(x0 + x1) / 2, y - 0.175, (z0 + z1) / 2],
    })
  const pilePair = (x: number, z0: number, z1: number, y: number) => {
    for (const z of [z0, z1]) parts.push(piling(x, z, y - 0.2, ground(x, z) - 0.8))
  }
  const half = pier.width / 2
  parts.push(slab(pier.x0, pier.x1, pier.z - half, pier.z + half, deck))
  // The T-head at the seaward end.
  parts.push(slab(pier.x1 - 7, pier.x1 + 1, pier.z - 4.2, pier.z + 4.2, deck))
  for (let x = pier.x0 + 2; x <= pier.x1 - 7; x += 5) {
    pilePair(x, pier.z - half + 0.35, pier.z + half - 0.35, deck)
  }
  for (const dx of [-6, 0.5]) {
    pilePair(pier.x1 + dx, pier.z - 3.9, pier.z + 3.9, deck)
  }
  for (const finger of fingers) {
    const fh = finger.width / 2
    parts.push(slab(finger.x - fh, finger.x + fh, finger.z0, finger.z1, deck))
    for (let z = finger.z0 + 3; z <= finger.z1; z += 6) {
      for (const x of [finger.x - fh + 0.3, finger.x + fh - 0.3]) {
        parts.push(piling(x, z, deck - 0.2, ground(x, z) - 0.8))
      }
    }
  }
  // Mooring posts along the main pier.
  for (let x = pier.x0 + 12; x < pier.x1 - 8; x += 14) {
    for (const sz of [-1, 1]) {
      parts.push(
        prism({
          color: color.timber,
          radiusTop: 0.2,
          radiusBottom: 0.24,
          bottom: deck,
          top: deck + 0.8,
          sides: 5,
          position: [x, 0, pier.z + sz * (half - 0.25)],
        }),
      )
    }
  }
  return parts
}

function lighthouseParts(layout: TownLayout, ground: TownGround): BufferGeometry[] {
  const { x, z, height } = layout.lighthouse
  const base = ground(x, z)
  let low = base
  for (let a = 0; a < 8; a++) {
    low = Math.min(low, ground(x + Math.cos(a) * 7, z + Math.sin(a) * 7))
  }
  const radius = (y: number) => 5.4 - 1.7 * ((y - base - 3) / 27)
  const at = (y: number) => base + y
  const parts: BufferGeometry[] = [
    prism({
      color: color.rockShadow,
      radiusBottom: 7.4,
      radiusTop: 6.6,
      bottom: low - 1.5,
      top: at(3),
      sides: 8,
      jitter: 0.15,
      seed: 31,
      position: [x, 0, z],
    }),
    prism({
      color: color.wallLime,
      radiusBottom: 5.4,
      radiusTop: 3.7,
      bottom: at(3),
      top: at(30),
      sides: 8,
      position: [x, 0, z],
    }),
  ]
  // Two terracotta bands: the daymark that reads at the reveal.
  for (const [a, b] of [
    [9, 14],
    [20, 25],
  ] as const) {
    parts.push(
      prism({
        color: color.roofTerracotta,
        radiusBottom: radius(at(a)) + 0.12,
        radiusTop: radius(at(b)) + 0.12,
        bottom: at(a),
        top: at(b),
        sides: 8,
        position: [x, 0, z],
      }),
    )
  }
  parts.push(
    // Gallery, lantern room (glows at night), roof and finial.
    prism({
      color: color.timber,
      radiusBottom: 3.7,
      radiusTop: 5.2,
      bottom: at(29),
      top: at(31),
      sides: 8,
      position: [x, 0, z],
    }),
    prism({
      color: color.windowGlass,
      radiusBottom: 3,
      radiusTop: 3,
      bottom: at(31),
      top: at(36),
      sides: 8,
      glow: 1,
      position: [x, 0, z],
    }),
    prism({
      color: color.roofSlate,
      radiusBottom: 4.4,
      radiusTop: 0.3,
      bottom: at(36),
      top: at(41.5),
      sides: 8,
      position: [x, 0, z],
    }),
    prism({
      color: color.timber,
      radiusBottom: 0.3,
      radiusTop: 0.1,
      bottom: at(41.5),
      top: at(height),
      sides: 6,
      position: [x, 0, z],
    }),
    block(new BoxGeometry(1.6, 2.6, 0.5), {
      color: color.timber,
      position: [x + 5.3 * Math.cos(Math.PI / 8), base + 1.5, z - 5.3 * Math.sin(Math.PI / 8)],
      rotation: [0, Math.PI / 8 + Math.PI / 2, 0],
    }),
  )
  // Three slit windows up the shaft.
  for (const [y, k] of [
    [15, 1],
    [17.5, 5],
    [27, 3],
  ] as const) {
    const angle = Math.PI / 8 + (k * Math.PI) / 4
    const r = radius(at(y)) * Math.cos(Math.PI / 8) + 0.05
    parts.push(
      block(new BoxGeometry(0.8, 1.7, 0.3), {
        color: color.windowGlass,
        position: [x + Math.sin(angle) * r, at(y), z + Math.cos(angle) * r],
        rotation: [0, angle, 0],
        glow: 1,
      }),
    )
  }
  return parts
}

function propParts(layout: TownLayout, ground: TownGround): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  for (const crate of layout.crates) {
    parts.push(
      block(new BoxGeometry(crate.size, crate.size, crate.size), {
        color: color.bark,
        position: [crate.x, crate.y + crate.size / 2, crate.z],
        rotation: [0, crate.yaw, 0],
      }),
    )
  }
  for (const barrel of layout.barrels) {
    parts.push(
      prism({
        color: color.timber,
        radiusBottom: 0.42,
        radiusTop: 0.46,
        bottom: barrel.y,
        top: barrel.y + 1,
        sides: 6,
        position: [barrel.x, 0, barrel.z],
      }),
    )
  }
  // The net-drying rack: two posts, a bar, and a net hung from it.
  const { rack } = layout
  const cos = Math.cos(rack.yaw)
  const sin = Math.sin(rack.yaw)
  const base = ground(rack.x, rack.z)
  const half = rack.length / 2
  const local = (lx: number): [number, number] => [rack.x + lx * cos, rack.z - lx * sin]
  for (const lx of [-half, half]) {
    const [px, pz] = local(lx)
    parts.push(
      block(new BoxGeometry(0.3, 4.2, 0.3), {
        color: color.timber,
        position: [px, base + 1.5, pz],
      }),
    )
  }
  parts.push(
    block(new BoxGeometry(rack.length + 0.6, 0.2, 0.2), {
      color: color.timber,
      position: [rack.x, base + 3.5, rack.z],
      rotation: [0, rack.yaw, 0],
    }),
    block(new BoxGeometry(rack.length - 0.4, 2.1, 0.06), {
      color: color.sand,
      position: [rack.x, base + 2.4, rack.z],
      rotation: [0, rack.yaw, 0],
    }),
  )
  return parts
}

/** m, how far a road floats over the ground: clear of the terrain mesh's coarser facets. */
const ROAD_LIFT = 0.3

/**
 * A dirt road: a flat ribbon draped over the ground along its centre line, each cross-section
 * `ROAD_LIFT` over the ground at both edges, so it follows the shore's slope.
 */
function roadRibbon(road: TownRoad, ground: TownGround): BufferGeometry {
  const pts = road.points
  const left: Vector3[] = []
  const right: Vector3[] = []
  const half = road.width / 2
  pts.forEach(([x, z], i) => {
    const [px, pz] = pts[Math.max(0, i - 1)]!
    const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)]!
    const length = Math.hypot(nx - px, nz - pz) || 1
    // Across the road: the tangent turned a quarter.
    const ax = -(nz - pz) / length
    const az = (nx - px) / length
    // Ends taper to a point-ish round-off so a spur's end doesn't stop in a square.
    const w = i === 0 || i === pts.length - 1 ? half * 0.8 : half
    const l: [number, number] = [x + ax * w, z + az * w]
    const r: [number, number] = [x - ax * w, z - az * w]
    left.push(new Vector3(l[0], ground(...l) + ROAD_LIFT, l[1]))
    right.push(new Vector3(r[0], ground(...r) + ROAD_LIFT, r[1]))
  })
  const positions: number[] = []
  const tri = (a: Vector3, b: Vector3, c: Vector3) => {
    // Wind every triangle to face up, so the toon side is the top.
    const up = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).y >= 0
    const [p, q] = up ? [b, c] : [c, b]
    positions.push(a.x, a.y, a.z, p.x, p.y, p.z, q.x, q.y, q.z)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    tri(left[i]!, right[i]!, left[i + 1]!)
    tri(right[i]!, right[i + 1]!, left[i + 1]!)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return part(geometry, { color: color.dirtRoad })
}

/**
 * The town's merged model in its own frame. `ground` is the terrain relative to the origin, so
 * footings and pilings reach the ground and the sea bed under them.
 */
export function buildTown(layout: TownLayout, ground: TownGround): BufferGeometry {
  const parts: BufferGeometry[] = [
    ...layout.houses.flatMap((house) => placeHouse(house, ground, layout)),
    ...deckParts(layout.pier, layout.fingers, ground),
    ...lighthouseParts(layout, ground),
    ...propParts(layout, ground),
    ...layout.roads.map((road) => roadRibbon(road, ground)),
  ]
  return mergeParts(parts)
}

/** m, the tallest house ridge over its floor, for the lighthouse's 3× rule. */
export function tallestRidge(layout: TownLayout): number {
  return Math.max(...layout.houses.map(ridgeHeight))
}
