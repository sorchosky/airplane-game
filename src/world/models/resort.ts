import { BoxGeometry, Matrix4, type BufferGeometry } from 'three'
import { color } from '../../styles/tokens'
import {
  BUNGALOW_SIZE,
  type ResortGround,
  type ResortLayout,
  type ResortNode,
} from '../resortLayout'
import { block, mergeParts, prism } from './kit'
import { gableFill } from './town'

// The resort on Long Isle (#235): a lodge with a steep thatched roof, five overwater bungalows on
// stilts along a curved boardwalk, a short jetty, lanterns, beach umbrellas and loungers. One
// merged geometry in the resort's frame (`resortLayout.ts`: origin at the lodge's ground point,
// +x seaward), added to the landmarks' single toon draw and outline draw. Thatch and timber are
// the resort's own tokens; the umbrellas and the lodge door take the town's `roofTerracotta`, so
// the two read as one world. Windows and lanterns carry the `glow` mask, as the town's do (#224).

/** m, how far the thatch reaches past the wall, and its thickness */
const EAVE = 1.1
const SLAB = 0.5

/** A thatched gable roof over a box `length` (along the ridge, x) by `width` (z), wall height `h`. */
function thatchedRoof(
  length: number,
  width: number,
  h: number,
  pitch: number,
  wall: string,
): BufferGeometry[] {
  const hw = width / 2
  const rise = hw * Math.tan(pitch)
  const run = hw + EAVE
  const slabLength = run / Math.cos(pitch) + 0.15
  const ridge = h + rise
  const parts: BufferGeometry[] = [gableFill(hw, rise, length, wall).translate(0, h, 0)]
  for (const side of [-1, 1]) {
    // As the town's roofs: the slab's top runs through the ridge, its centre half a slab down.
    const centreZ =
      (side * run) / 2 - side * 0.075 * Math.cos(pitch) + side * Math.sin(pitch) * (SLAB / 2)
    const centreY =
      ridge - (run * Math.tan(pitch)) / 2 + 0.075 * Math.sin(pitch) + Math.cos(pitch) * (SLAB / 2)
    parts.push(
      block(new BoxGeometry(length + 2 * EAVE, SLAB, slabLength), {
        color: color.thatch,
        position: [0, centreY, centreZ],
        rotation: [side * pitch, 0, 0],
      }),
    )
  }
  parts.push(
    block(new BoxGeometry(length + 2 * EAVE + 0.2, 0.32, 0.7), {
      color: color.thatchDark,
      position: [0, ridge + 0.12, 0],
    }),
  )
  return parts
}

/** A window pane that glows at night, standing proud of a wall facing `rotation` about Y. */
function pane(x: number, y: number, z: number, rotation: number): BufferGeometry {
  return block(new BoxGeometry(0.9, 1.1, 0.2), {
    color: color.windowGlass,
    position: [x, y, z],
    rotation: [0, rotation, 0],
    glow: 1,
  })
}

/** A piling from `top` down to `bottom`. */
function post(x: number, z: number, top: number, bottom: number): BufferGeometry {
  return prism({
    color: color.timber,
    radiusTop: 0.2,
    radiusBottom: 0.24,
    bottom: Math.min(bottom, top - 0.5),
    top,
    sides: 4,
    twist: Math.PI / 4,
    position: [x, 0, z],
  })
}

/** A deck plank run from node `a` to node `b`, its top following the nodes' heights. */
function plank(a: ResortNode, b: ResortNode, width: number): BufferGeometry {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const run = Math.hypot(dx, dz)
  return block(new BoxGeometry(run + 0.3, 0.3, width), {
    color: color.deckPlank,
    position: [(a.x + b.x) / 2, (a.y + b.y) / 2 - 0.15, (a.z + b.z) / 2],
    // Pitch about Z first, then turn to the heading.
    rotation: [0, Math.atan2(-dz, dx), Math.atan2(b.y - a.y, run)],
  })
}

/** Moves parts built in a frame that stands at (x, y, z) turned by `yaw` into the resort's frame. */
function place(
  parts: BufferGeometry[],
  x: number,
  y: number,
  z: number,
  yaw: number,
): BufferGeometry[] {
  const matrix = new Matrix4().makeRotationY(yaw).setPosition(x, y, z)
  return parts.map((geometry) => geometry.applyMatrix4(matrix))
}

function lodgeParts(layout: ResortLayout): BufferGeometry[] {
  const { length, width, wallHeight: H, pitch, floor, lowest } = layout.lodge
  const parts: BufferGeometry[] = []
  const depth = floor - lowest + 1.2
  parts.push(
    block(new BoxGeometry(width + 0.6, depth, length + 0.6), {
      color: color.timber,
      position: [0, -(depth / 2) + 0.3, 0],
    }),
    block(new BoxGeometry(length, H, width), { color: color.deckPlank, position: [0, H / 2, 0] }),
  )
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        block(new BoxGeometry(0.5, H, 0.5), {
          color: color.timber,
          position: [(sx * length) / 2, H / 2, (sz * width) / 2],
        }),
      )
    }
  }
  // In the roof's frame, the front (toward the sea) is +z and the ridge runs along x.
  const front = width / 2 + 0.04
  parts.push(
    block(new BoxGeometry(1.8, 2.5, 0.3), {
      color: color.roofTerracotta,
      position: [0, 1.25, front],
    }),
    pane(-length * 0.28, 1.9, front, 0),
    pane(length * 0.28, 1.9, front, 0),
    pane(-length * 0.28, 1.9, -front, Math.PI),
    pane(length * 0.28, 1.9, -front, Math.PI),
    pane(0, 1.9, 0, Math.PI / 2).translate(length / 2 + 0.04, 0, 0),
    pane(0, 1.9, 0, -Math.PI / 2).translate(-length / 2 - 0.04, 0, 0),
    // The porch: a deck across the front with its two posts.
    block(new BoxGeometry(length * 0.7, 0.3, 3), {
      color: color.deckPlank,
      position: [0, 0.05, width / 2 + 1.5],
    }),
  )
  for (const sx of [-1, 1]) {
    parts.push(post(sx * length * 0.33, width / 2 + 2.6, 2.7, -0.8))
  }
  parts.push(...thatchedRoof(length, width, H, pitch, color.deckPlank))
  // Built with the ridge along x and the front on +z: turn a quarter so the front faces +x (sea).
  const turned = place(parts, 0, floor, 0, Math.PI / 2)
  return turned
}

function bungalowParts(
  layout: ResortLayout,
  ground: ResortGround,
  index: number,
): BufferGeometry[] {
  const b = layout.bungalows[index]!
  const { length: L, width: W } = BUNGALOW_SIZE
  const H = 2.5
  const parts: BufferGeometry[] = [
    block(new BoxGeometry(L + 0.8, 0.35, W + 0.8), {
      color: color.deckPlank,
      position: [0, -0.18, 0],
    }),
    block(new BoxGeometry(L, H, W), { color: color.deckPlank, position: [0, H / 2, 0] }),
    // The door onto the boardwalk side, a terracotta accent.
    block(new BoxGeometry(1.1, 2.0, 0.28), {
      color: color.roofTerracotta,
      position: [0, 1, (-b.side * W) / 2],
    }),
    pane(-L * 0.3, 1.5, (b.side * W) / 2 + b.side * 0.04, b.side > 0 ? 0 : Math.PI),
    pane(L * 0.3, 1.5, (b.side * W) / 2 + b.side * 0.04, b.side > 0 ? 0 : Math.PI),
    pane(0, 1.5, 0, Math.PI / 2).translate(L / 2 + 0.04, 0, 0),
    // The bridge from the boardwalk to the door.
    block(new BoxGeometry(1.4, 0.26, 2.4), {
      color: color.deckPlank,
      position: [0, -0.13, (-b.side * (W / 2 + 1.5)) / 1],
    }),
  ]
  // Stilts at the platform's corners, down to the bed.
  const cos = Math.cos(b.yaw)
  const sin = Math.sin(b.yaw)
  for (const u of [-1, 1]) {
    for (const v of [-1, 1]) {
      const lx = (u * (L + 0.4)) / 2
      const lz = (v * (W + 0.4)) / 2
      const bed = ground(b.x + lx * cos + lz * sin, b.z - lx * sin + lz * cos)
      parts.push(post(lx, lz, -0.3, bed - b.floor - 0.6))
    }
  }
  parts.push(...thatchedRoof(L, W, H, (46 * Math.PI) / 180, color.deckPlank))
  return place(parts, b.x, b.floor, b.z, b.yaw)
}

function boardwalkParts(layout: ResortLayout, ground: ResortGround): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  const { nodes, width } = layout.boardwalk
  for (let i = 0; i < nodes.length - 1; i++) {
    parts.push(plank(nodes[i]!, nodes[i + 1]!, width))
  }
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i]!
    const above = node.y - ground(node.x, node.z)
    if (above < 0.8) continue
    const a = nodes[i - 1]!
    const heading = Math.atan2(node.z - a.z, node.x - a.x)
    for (const side of [-1, 1]) {
      const px = node.x - Math.sin(heading) * side * (width / 2 - 0.25)
      const pz = node.z + Math.cos(heading) * side * (width / 2 - 0.25)
      parts.push(post(px, pz, node.y - 0.25, ground(px, pz) - 0.6))
    }
  }
  const { from, to, width: jetty } = layout.jetty
  parts.push(plank(from, to, jetty))
  const run = Math.hypot(to.x - from.x, to.z - from.z)
  const heading = Math.atan2(to.z - from.z, to.x - from.x)
  for (let d = 5; d <= run; d += 5.5) {
    const t = d / run
    const x = from.x + (to.x - from.x) * t
    const z = from.z + (to.z - from.z) * t
    const y = from.y + (to.y - from.y) * t
    for (const side of [-1, 1]) {
      const px = x - Math.sin(heading) * side * (jetty / 2 - 0.25)
      const pz = z + Math.cos(heading) * side * (jetty / 2 - 0.25)
      parts.push(post(px, pz, y - 0.25, ground(px, pz) - 0.6))
    }
  }
  return parts
}

function lanternParts(layout: ResortLayout): BufferGeometry[] {
  return layout.lanterns.flatMap((lantern) => [
    prism({
      color: color.timber,
      radiusTop: 0.07,
      radiusBottom: 0.09,
      bottom: lantern.y,
      top: lantern.y + 2.2,
      sides: 4,
      position: [lantern.x, 0, lantern.z],
    }),
    block(new BoxGeometry(0.4, 0.5, 0.4), {
      color: color.windowGlow,
      position: [lantern.x, lantern.y + 2.4, lantern.z],
      glow: 1,
    }),
  ])
}

function beachParts(layout: ResortLayout): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  layout.umbrellas.forEach((umbrella, i) => {
    parts.push(
      prism({
        color: color.timber,
        radiusTop: 0.05,
        radiusBottom: 0.07,
        bottom: umbrella.y - 0.2,
        top: umbrella.y + 2.4,
        sides: 4,
        position: [umbrella.x, 0, umbrella.z],
      }),
      prism({
        color: i % 2 === 0 ? color.roofTerracotta : color.wallLime,
        radiusTop: 0.08,
        radiusBottom: 2,
        bottom: umbrella.y + 2.1,
        top: umbrella.y + 2.9,
        sides: 8,
        position: [umbrella.x, 0, umbrella.z],
      }),
    )
  })
  for (const lounger of layout.loungers) {
    parts.push(
      block(new BoxGeometry(1.9, 0.28, 0.75), {
        color: color.deckPlank,
        position: [lounger.x, lounger.y + 0.3, lounger.z],
        rotation: [0, lounger.yaw, 0],
      }),
      block(new BoxGeometry(0.8, 0.14, 0.7), {
        color: color.wallLime,
        position: [lounger.x - 0.55, lounger.y + 0.55, lounger.z],
        rotation: [0, lounger.yaw, 0.5],
      }),
    )
  }
  return parts
}

/** The resort's merged geometry, in its own frame, over the ground `ground` gives. */
export function buildResort(layout: ResortLayout, ground: ResortGround): BufferGeometry {
  return mergeParts([
    ...lodgeParts(layout),
    ...layout.bungalows.flatMap((_, i) => bungalowParts(layout, ground, i)),
    ...boardwalkParts(layout, ground),
    ...lanternParts(layout),
    ...beachParts(layout),
  ])
}
