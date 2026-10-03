// The plane's side of the wrapping world (#177). Pure: no React or Three.
//
// The terrain repeats every `period` m on x and z (#176). The sim keeps the plane inside one
// period, [-period/2, period/2) on both axes: when it flies out of one side, its position moves by
// a whole period to the other side, where the world looks exactly the same. That also keeps the
// numbers small on a long flight. Everything that remembers where the plane was (the camera's
// springs, vortex trails, the golden path's last position) moves by the same amount in the same
// frame, and everything drawn at a fixed place in the world (landmarks, rings, the cloud gate) is
// drawn at its copy nearest the camera.

/** A horizontal move, m. Wrapping only ever moves x and z, by whole periods. */
export interface WrapShift {
  x: number
  z: number
}

/** `value` moved by whole periods into [-period/2, period/2). */
export function wrapCoord(value: number, period: number): number {
  const half = period / 2
  return value - period * Math.floor((value + half) / period)
}

/**
 * Moves `position` back inside [-period/2, period/2) on x and z, in place, and writes the move
 * (whole periods, 0 when it was already inside) to `shift`. Returns whether it moved.
 */
export function wrapPosition(
  position: { x: number; z: number },
  period: number,
  shift: WrapShift,
): boolean {
  const half = period / 2
  // Whole periods, so the move is exact and everything that follows it moves by the same amount.
  shift.x = -period * Math.floor((position.x + half) / period) || 0
  shift.z = -period * Math.floor((position.z + half) / period) || 0
  if (shift.x === 0 && shift.z === 0) return false
  position.x += shift.x
  position.z += shift.z
  return true
}

/**
 * How far to move something placed at `value` so it draws at its copy nearest `reference` (the
 * camera): a whole number of periods, 0 when it is already the nearest.
 */
export function imageShift(value: number, reference: number, period: number): number {
  // `wrapNear(value, reference, period) - value`, kept to exact whole periods.
  return -period * Math.round((value - reference) / period) || 0
}

/** Smallest length both `a` and `b` divide (whole metres): where two grids line up again. */
export function commonPeriod(a: number, b: number): number {
  let x = Math.round(a)
  let y = Math.round(b)
  while (y !== 0) [x, y] = [y, x % y]
  return (Math.round(a) / x) * Math.round(b)
}

/**
 * A streamed system's own frame (terrain tiles, foliage chunks). Their grids don't divide the
 * period (24 km is 46.875 terrain chunks, 187.5 foliage chunks), so a grid cell's copy one period
 * away isn't a cell of the same grid, and re-keying at the seam would rebuild a whole band.
 * Instead the system keeps building in a frame that runs on smoothly across the seam, and draws
 * that frame moved by `offset`: the plane's position in the frame is its sim position minus
 * `offset`. A wrap adds the sim's move to `offset`, so nothing in the frame changes.
 *
 * `rebase` takes `offset` back toward 0 by whole multiples of `anchor` (a common multiple of the
 * period and the grid's cell, where the two line up again), so the frame's numbers stay bounded.
 * The caller shifts its own keys and data by the returned amount.
 */
export class WrapFrame {
  offsetX = 0
  offsetZ = 0

  /** Records a sim wrap. */
  shift(shift: WrapShift): void {
    this.offsetX += shift.x
    this.offsetZ += shift.z
  }

  /** A sim x or z in the frame. */
  localX(x: number): number {
    return x - this.offsetX
  }

  localZ(z: number): number {
    return z - this.offsetZ
  }

  /**
   * When `offset` has reached `anchor` on an axis, takes `anchor` off it and returns how far the
   * frame's contents must move to stay put on screen (whole anchors, 0 when nothing changed).
   */
  rebase(anchor: number, out: WrapShift): boolean {
    // `|| 0` folds the -0 that trunc gives for small negative offsets.
    out.x = anchor * Math.trunc(this.offsetX / anchor) || 0
    out.z = anchor * Math.trunc(this.offsetZ / anchor) || 0
    if (out.x === 0 && out.z === 0) return false
    // Contents drawn at local + offset: moving them by `out` and the offset by -`out` keeps them.
    this.offsetX -= out.x
    this.offsetZ -= out.z
    return true
  }
}

/**
 * The distinct image shifts that draw every point at its copy nearest (`refX`, `refZ`): writes
 * them as x, z pairs into `out` and returns how many. For a model merged from several placed
 * parts (the landmarks): drawing the whole model once per returned shift puts every part at its
 * nearest copy. Points less than a period apart on each axis need at most two shifts per axis, so
 * `out` needs room for four pairs. Any other part in those copies sits at least half a period
 * away, past the view distance. Allocates nothing.
 */
export function nearestImages(
  points: readonly { readonly x: number; readonly z: number }[],
  refX: number,
  refZ: number,
  period: number,
  out: Float64Array,
): number {
  let count = 0
  for (const point of points) {
    const x = imageShift(point.x, refX, period)
    const z = imageShift(point.z, refZ, period)
    let seen = false
    for (let i = 0; i < count; i++) {
      if (out[i * 2] === x && out[i * 2 + 1] === z) seen = true
    }
    if (seen || count * 2 + 1 >= out.length) continue
    out[count * 2] = x
    out[count * 2 + 1] = z
    count++
  }
  return count
}
