import { mulberry32 } from './seeded'
import type { TownLayout } from './townLayout'

// The boats on the inland sea (#225), pure: which boats, where they moor and where they sail. The
// model (`models/boats.ts`) builds them and `landmarkMaterials` moves them in the vertex shader
// from this same data, so nothing here runs per frame.
//
// Everything is in the town's frame (`townLayout.ts`): origin at the pad's centre on the ground,
// x east (toward the sea), z south, y up, metres. A boat's own frame has its bow on -Z, with
// +X to starboard.

/** The town-palette token a hull is painted from. */
export type HullTone = 'wallLime' | 'roofTerracotta' | 'roofSlate' | 'timber'

export interface MooredBoat {
  kind: 'fishing'
  /** m, the hull's centre at the waterline */
  x: number
  z: number
  /** radians, turn about Y (0 = bow to the north) */
  yaw: number
  length: number
  hull: HullTone
  /** 0..1, offsets the bob and roll so no two boats rise together */
  phase: number
}

/** A closed loop: an ellipse about (cx, cz) with radii (rx, rz), sailed at a steady rate. */
export interface SailLoop {
  cx: number
  cz: number
  rx: number
  rz: number
  /** loops per second, signed: positive is clockwise seen from above (+x toward +z) */
  cycles: number
  /** 0..1, how far round the loop the boat starts at game time 0 */
  start: number
}

export interface SailingBoat {
  kind: 'sail'
  loop: SailLoop
  length: number
  hull: HullTone
  phase: number
}

export type Boat = MooredBoat | SailingBoat

export const BOAT_CONFIG = {
  /** m, the bob's amplitude */
  bob: 0.25,
  /** s, the bob's period runs from the first to the second, set per boat from its phase */
  bobPeriod: [4, 6] as const,
  /** radians, the roll's amplitude (3°) */
  roll: (3 * Math.PI) / 180,
  /** m, how far a sail's free edge sways to either side */
  sailSway: 0.3,
  /** s, the sails' sway period */
  sailPeriod: 7,
  /** m, sailboats keep at least this far off any shore, islands included */
  shoreClearance: 60,
  /** m/s, a sailboat's ground speed stays between these */
  speed: [1, 2] as const,
  /** m, sailboats stay within this of the town so they read from its station */
  townRadius: 3000,
}

/** The three sailing loops, as (cx, cz, rx, rz, speed at the minor radius m/s, start, direction). */
const LOOPS: readonly (readonly [number, number, number, number, number, number, 1 | -1])[] = [
  [750, 620, 350, 290, 1.2, 0.12, 1],
  [1860, 470, 560, 450, 1.4, 0.62, -1],
  [2450, -330, 430, 330, 1.4, 0.3, 1],
]

const FISHING_HULLS: readonly HullTone[] = ['roofSlate', 'roofTerracotta', 'wallLime', 'timber']
const SAIL_HULLS: readonly HullTone[] = ['wallLime', 'roofSlate', 'roofTerracotta']

/** m, the hull's beam: fishing boats and sailboats alike are drawn this wide (see `models/boats.ts`). */
export const FISHING_BEAM = 2.8
export const SAIL_BEAM = 3

/** m, how far a finger's two boats sit either side of its middle along it (first finger, second). */
const STAGGER = [2, 0.5] as const

/**
 * Four fishing boats alongside the two finger piers, one to each side of each, and three
 * sailboats, one on each loop.
 */
export function planBoats(layout: TownLayout, seed = 225): readonly Boat[] {
  const random = mulberry32(seed)
  const boats: Boat[] = []
  let hull = 0
  layout.fingers.forEach((finger, index) => {
    for (const side of [-1, 1] as const) {
      const length = 7.4 + random() * 1.8
      // Staggered along the finger, well clear of the main pier at its root.
      const mid = (finger.z0 + finger.z1) / 2
      const z = mid + STAGGER[index === 0 ? 0 : 1] * side + (random() - 0.5) * 0.8
      boats.push({
        kind: 'fishing',
        x: finger.x + side * (finger.width / 2 + FISHING_BEAM / 2 + 0.4),
        z,
        // Bows out or in, within a few degrees of the finger.
        yaw: (random() < 0.5 ? 0 : Math.PI) + (random() - 0.5) * 0.1,
        length,
        hull: FISHING_HULLS[hull++ % FISHING_HULLS.length] ?? 'wallLime',
        phase: random(),
      })
    }
  })
  LOOPS.forEach(([cx, cz, rx, rz, speed, start, direction], index) => {
    boats.push({
      kind: 'sail',
      loop: { cx, cz, rx, rz, cycles: (direction * speed) / (2 * Math.PI * rz), start },
      length: 9 + random() * 2,
      hull: SAIL_HULLS[index % SAIL_HULLS.length] ?? 'wallLime',
      phase: random(),
    })
  })
  return boats
}

/** Where a sailboat is at `time` seconds: its position and heading (radians, as `MooredBoat.yaw`). */
export function sailState(
  loop: SailLoop,
  time: number,
): { x: number; z: number; yaw: number; speed: number } {
  const angle = (loop.start + loop.cycles * time) * Math.PI * 2
  const sign = Math.sign(loop.cycles)
  const dx = -Math.sin(angle) * loop.rx * sign
  const dz = Math.cos(angle) * loop.rz * sign
  const speed = Math.hypot(dx, dz) * Math.abs(loop.cycles) * Math.PI * 2
  return {
    x: loop.cx + Math.cos(angle) * loop.rx,
    z: loop.cz + Math.sin(angle) * loop.rz,
    // The model's bow is -Z; a yaw of θ turns it to (-sin θ, -cos θ).
    yaw: Math.atan2(-dx, -dz),
    speed,
  }
}
