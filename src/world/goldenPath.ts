import type { FlightState } from '../flight/flightModel'
import { ROUTE, type Route } from './route'
import { GATE_STATIONS, type GateStation } from './routePoints'

// The golden path (#175): optional gates along the authored loop, with a lap completing at the
// return notch. Pure. Nothing here steers or relocates the aircraft.

export const GOLDEN_PATH = {
  /** m, wind ring radius: the torus and its gate disc */
  ringRadius: 15,
  ringSpeedGain: 2.5,
  /** m above the route's floor for a ring: the low cruise, level with the arch opening */
  ringHeight: 45,
  /** m above the route's floor for the cloud gate's centre */
  cloudHeight: 60,
  /** m, the cloud gate's disc, and the sphere that bursts it */
  cloudRadius: 150,
  /**
   * m, the return notch's disc, centred on the notch floor. Wider than its 250 m half floor and
   * taller than the 260 m ridge, so anything flying home through the notch crosses it.
   */
  notchRadius: 400,
  titleDuration: 5,
} as const

export interface PathPoint {
  x: number
  y: number
  z: number
}

/** A gate placed in the world: a disc at `position`, facing along the route. */
export interface Gate {
  readonly kind: GateStation['kind']
  readonly s: number
  readonly position: PathPoint
  /** Unit route direction at the gate, horizontal. A pass crosses the disc this way. */
  readonly normal: { readonly x: number; readonly z: number }
  readonly radius: number
}

export interface GoldenPathRoute {
  /** Every gate in route order. The last is the notch. */
  readonly gates: readonly Gate[]
  /** Indices into `gates` of the wind rings, in route order. */
  readonly rings: readonly number[]
  /** Index into `gates` of the cloud gate. */
  readonly cloud: number
  /** Index into `gates` of the return notch, the lap line. */
  readonly notch: number
}

const HEIGHT: Record<GateStation['kind'], number> = {
  ring: GOLDEN_PATH.ringHeight,
  cloud: GOLDEN_PATH.cloudHeight,
  notch: 0,
}

const RADIUS: Record<GateStation['kind'], number> = {
  ring: GOLDEN_PATH.ringRadius,
  cloud: GOLDEN_PATH.cloudRadius,
  notch: GOLDEN_PATH.notchRadius,
}

/** Places the gates of `stations` along `route`. */
export function createGoldenPathRoute(
  route: Route = ROUTE,
  stations: readonly GateStation[] = GATE_STATIONS,
): GoldenPathRoute {
  const gates = stations.map((station): Gate => {
    const point = route.pointAt(station.s)
    const tangent = route.tangentAt(station.s)
    return {
      kind: station.kind,
      s: station.s,
      position: { x: point.x, y: point.floorHeight + HEIGHT[station.kind], z: point.z },
      normal: { x: tangent.x, z: tangent.z },
      radius: RADIUS[station.kind],
    }
  })
  const rings: number[] = []
  gates.forEach((gate, i) => {
    if (gate.kind === 'ring') rings.push(i)
  })
  const cloud = gates.findIndex((gate) => gate.kind === 'cloud')
  const notch = gates.length - 1
  if (cloud < 0 || gates[notch]?.kind !== 'notch') {
    throw new Error('the golden path needs a cloud gate and ends at the notch')
  }
  return { gates, rings, cloud, notch }
}

/** Ring gates immediately ahead of route position `s`, wrapping into the next lap. */
export function nextGates(
  s: number,
  count: number,
  route: GoldenPathRoute = createGoldenPathRoute(),
): readonly Gate[] {
  if (count <= 0 || route.rings.length === 0) return []
  const ahead = route.rings.findIndex((index) => route.gates[index]!.s > s)
  const start = ahead < 0 ? 0 : ahead
  const result: Gate[] = []
  for (let i = 0; i < Math.min(count, route.rings.length); i += 1) {
    result.push(route.gates[route.rings[(start + i) % route.rings.length]!]!)
  }
  return result
}

/**
 * True when the frame's move from `from` to `to` crosses `gate`'s disc in the route's direction.
 * Swept, so a fast frame cannot skip it, and one-way, so flying the loop backwards counts nothing.
 */
export function crossesGate(from: PathPoint, to: PathPoint, gate: Gate): boolean {
  const { position: c, normal: n } = gate
  const before = (from.x - c.x) * n.x + (from.z - c.z) * n.z
  const after = (to.x - c.x) * n.x + (to.z - c.z) * n.z
  if (!(before < 0 && after >= 0)) return false
  const t = before / (before - after)
  return (
    Math.hypot(
      from.x + (to.x - from.x) * t - c.x,
      from.y + (to.y - from.y) * t - c.y,
      from.z + (to.z - from.z) * t - c.z,
    ) <= gate.radius
  )
}

/** Indices of the gates the frame's move passes through, in route order. */
export function stationsPassed(gates: readonly Gate[], from: PathPoint, to: PathPoint): number[] {
  const passed: number[] = []
  gates.forEach((gate, i) => {
    if (crossesGate(from, to, gate)) passed.push(i)
  })
  return passed
}

export interface LoopProgress {
  /** Index of the next gate the lap expects. */
  readonly next: number
  /** Gates passed this lap, by index. Drives which rings are lit. */
  readonly passed: readonly boolean[]
  /** False once this lap skipped a gate or took one out of order. */
  readonly inOrder: boolean
  /** Laps completed. */
  readonly laps: number
}

export function initialProgress(gateCount: number, laps = 0): LoopProgress {
  return { next: 0, passed: new Array<boolean>(gateCount).fill(false), inOrder: true, laps }
}

export interface ProgressStep {
  readonly progress: LoopProgress
  /** Gates newly passed this step, for their feedback. */
  readonly newlyPassed: readonly number[]
  readonly lapCompleted: boolean
}

/**
 * Advances the lap by the gates passed this frame (`stationsPassed`). Nothing ever fails:
 * - The next gate advances the lap.
 * - A later gate is a rejoin. The lap picks up after it, but it is no longer in order.
 * - The notch closes the lap. It completes when every gate before it was passed in order, and
 *   either way the next lap starts with every gate lit again.
 */
export function advanceProgress(progress: LoopProgress, crossed: readonly number[]): ProgressStep {
  const notch = progress.passed.length - 1
  let { next, inOrder, laps } = progress
  let passed: boolean[] | null = null
  const newlyPassed: number[] = []
  let lapCompleted = false
  for (const index of crossed) {
    if (index === notch) {
      lapCompleted = inOrder && next === notch
      if (lapCompleted) laps += 1
      newlyPassed.push(index)
      // The notch is also the start line: the next lap begins here, every gate lit.
      passed = new Array<boolean>(progress.passed.length).fill(false)
      next = 0
      inOrder = true
      continue
    }
    if ((passed ?? progress.passed)[index]) continue
    passed ??= [...progress.passed]
    passed[index] = true
    newlyPassed.push(index)
    if (index !== next) inOrder = false
    next = Math.max(next, index + 1)
  }
  if (!passed) return { progress, newlyPassed, lapCompleted }
  return { progress: { next, passed, inOrder, laps }, newlyPassed, lapCompleted }
}

export function applyRingSpeedGain(state: Pick<FlightState, 'speed'>, maxSpeed: number): number {
  state.speed = Math.min(maxSpeed, state.speed + GOLDEN_PATH.ringSpeedGain)
  return state.speed
}
