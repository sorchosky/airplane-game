// The resort's plan (#235), pure and in the resort's own frame: origin at the lodge's ground point,
// +x seaward, +z along the shore, y up (zero at the origin's ground). The model (`models/resort.ts`)
// builds from it, `resort.ts` places it on the largest island, and the tests read its footprints.

/** m, ground height under a point, relative to the origin's ground */
export type ResortGround = (x: number, z: number) => number

export interface ResortCircle {
  x: number
  z: number
  radius: number
}

export interface ResortNode {
  x: number
  z: number
  /** m, the deck's top over the origin's ground */
  y: number
}

export interface ResortBungalow {
  /** centre of the platform */
  x: number
  z: number
  /** radians about Y: the long side runs along the boardwalk */
  yaw: number
  /** m, platform top */
  floor: number
  /** +1 / -1, which side of the boardwalk it stands on */
  side: 1 | -1
}

export interface ResortLayout {
  lodge: {
    /** m, along the shore (z) and out to sea (x) */
    length: number
    width: number
    wallHeight: number
    /** radians, the thatch's pitch */
    pitch: number
    /** m, floor over the origin's ground */
    floor: number
    /** m, lowest ground under it, so the plinth reaches it */
    lowest: number
  }
  boardwalk: { nodes: readonly ResortNode[]; width: number }
  bungalows: readonly ResortBungalow[]
  /** A jetty running on from the boardwalk's last node, along its last tangent. */
  jetty: { from: ResortNode; to: ResortNode; width: number }
  umbrellas: readonly { x: number; z: number; y: number }[]
  loungers: readonly { x: number; z: number; y: number; yaw: number }[]
  lanterns: readonly ResortNode[]
  /** m, the water plane's height over the origin's ground */
  waterHeight: number
  footprints: readonly ResortCircle[]
}

export interface ResortPlanConfig {
  /** m, the water plane's height over the origin's ground (negative: the lodge stands above it) */
  waterHeight: number
  /** m, how far out to sea the boardwalk starts and ends */
  boardwalkFrom: number
  boardwalkTo: number
  /** m, the boardwalk's sideways swing */
  swing: number
  /** m, how high the deck stands over the water */
  deckOverWater: number
  /** m, the jetty's length */
  jettyLength: number
}

export const RESORT_PLAN = {
  boardwalkFrom: 13,
  boardwalkTo: 152,
  swing: 22,
  deckOverWater: 1.5,
  jettyLength: 22,
} as const

const NODES = 13
/** Boardwalk nodes (by index) that carry a bungalow, alternating sides. */
const BUNGALOW_NODES = [7, 8, 9, 10, 12] as const
/** m, from the boardwalk's centre line to a bungalow's centre */
const BUNGALOW_OFFSET = 6.4
const BUNGALOW_SIZE = { length: 6, width: 5 } as const
const BOARDWALK_WIDTH = 2.4

/** Plans the resort over `ground`, with the water plane `waterHeight` m over the origin. */
export function planResort(
  ground: ResortGround,
  config: Pick<ResortPlanConfig, 'waterHeight'> & Partial<ResortPlanConfig>,
): ResortLayout {
  const plan = { ...RESORT_PLAN, ...config }
  const deckAt = (x: number, z: number) =>
    Math.max(ground(x, z) + 0.35, config.waterHeight + plan.deckOverWater)

  // The lodge: a step above the highest ground under it.
  const length = 24
  const width = 14
  let high = -Infinity
  let low = Infinity
  for (const u of [-0.5, 0, 0.5]) {
    for (const v of [-0.5, 0, 0.5]) {
      const g = ground(u * width, v * length)
      high = Math.max(high, g)
      low = Math.min(low, g)
    }
  }
  const lodge = {
    length,
    width,
    wallHeight: 4,
    pitch: (60 * Math.PI) / 180,
    floor: high + 0.3,
    lowest: low,
  }

  // The boardwalk curves out from the lodge's front and back toward the shore, over the shallows.
  const nodes: ResortNode[] = []
  for (let i = 0; i < NODES; i++) {
    const s = i / (NODES - 1)
    const x = plan.boardwalkFrom + s * (plan.boardwalkTo - plan.boardwalkFrom)
    const z = plan.swing * Math.sin(s * Math.PI * 0.9)
    nodes.push({ x, z, y: deckAt(x, z) })
  }
  const tangent = (i: number): [number, number] => {
    const a = nodes[Math.max(0, i - 1)]!
    const b = nodes[Math.min(NODES - 1, i + 1)]!
    const length2 = Math.hypot(b.x - a.x, b.z - a.z)
    return [(b.x - a.x) / length2, (b.z - a.z) / length2]
  }

  const bungalows: ResortBungalow[] = BUNGALOW_NODES.map((index, k) => {
    const node = nodes[index]!
    const [tx, tz] = tangent(index)
    const side: 1 | -1 = k % 2 === 0 ? 1 : -1
    const x = node.x + -tz * side * BUNGALOW_OFFSET
    const z = node.z + tx * side * BUNGALOW_OFFSET
    // x' (the long side) runs along the tangent: a yaw about Y maps +x to (cos, -sin).
    return { x, z, yaw: Math.atan2(-tz, tx), floor: node.y, side }
  })

  const last = nodes[NODES - 1]!
  const [jx, jz] = tangent(NODES - 1)
  const jettyEnd = {
    x: last.x + jx * plan.jettyLength,
    z: last.z + jz * plan.jettyLength,
    y: 0,
  }
  jettyEnd.y = deckAt(jettyEnd.x, jettyEnd.z)

  const umbrellaSpots: [number, number][] = [
    [24, -9],
    [31, -17],
    [37, -6],
    [21, -21],
  ]
  const umbrellas = umbrellaSpots.map(([x, z]) => ({ x, z, y: ground(x, z) }))
  const loungers = umbrellaSpots.flatMap(([x, z], i) =>
    [-1, 1].slice(0, i < 2 ? 2 : 1).map((side) => ({
      x: x + 1.2,
      z: z + side * 1.5,
      y: ground(x + 1.2, z + side * 1.5),
      yaw: 0.15 * side,
    })),
  )

  // Lanterns on the boardwalk's rail every other node, one on the jetty's end, two at the lodge.
  const lanterns: ResortNode[] = []
  for (let i = 2; i < NODES; i += 2) {
    const node = nodes[i]!
    const [tx, tz] = tangent(i)
    const side = i % 4 === 0 ? 1 : -1
    lanterns.push({
      x: node.x - tz * side * (BOARDWALK_WIDTH / 2 - 0.1),
      z: node.z + tx * side * (BOARDWALK_WIDTH / 2 - 0.1),
      y: node.y,
    })
  }
  lanterns.push({ x: jettyEnd.x, z: jettyEnd.z, y: jettyEnd.y })
  for (const z of [-5.5, 5.5]) {
    lanterns.push({ x: width / 2 + 1.4, z, y: lodge.floor })
  }

  const footprints: ResortCircle[] = [
    { x: 0, z: 0, radius: 17 },
    { x: 29, z: -14, radius: 17 },
    ...nodes.map((n) => ({ x: n.x, z: n.z, radius: 5 })),
    ...bungalows.map((b) => ({ x: b.x, z: b.z, radius: 6 })),
    {
      x: (last.x + jettyEnd.x) / 2,
      z: (last.z + jettyEnd.z) / 2,
      radius: plan.jettyLength / 2 + 3,
    },
  ]

  return {
    lodge,
    boardwalk: { nodes, width: BOARDWALK_WIDTH },
    bungalows,
    jetty: { from: last, to: jettyEnd, width: 2.2 },
    umbrellas,
    loungers,
    lanterns,
    waterHeight: config.waterHeight,
    footprints,
  }
}

export { BUNGALOW_SIZE }
