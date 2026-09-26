import { percentile } from './frameStats'

/**
 * Gesture-to-visible-bank latency probe. Pure: no DOM, React or store imports, all state in
 * preallocated typed arrays so it can run every frame without allocating.
 *
 * One sample is the chain for one input change:
 *
 *   camera frame captured ─wait─▶ detection starts ─infer─▶ detection ends ─handoff─▶
 *   `ControlInput` written ─respond─▶ first rendered frame whose bank moved `bankThreshold`
 *
 * `markCameraFrame` and `markDetect` come from the pose service; `markInput` from the input
 * store; `markFrame` from the render loop after the flight step, every frame. A sample arms when
 * an input's roll jumps by `rollThreshold` and completes when the bank has visibly moved. Keyboard
 * input has no camera stages, so those hops are skipped (NaN) and only `respond` is recorded.
 *
 * Times are `performance.now()` ms. The `frame` stamp is taken when the frame's simulation step
 * has run, before the GPU draws and the display scans out, so add roughly one frame for photons.
 */
export interface LatencyHops {
  wait: number
  infer: number
  handoff: number
  respond: number
  total: number
}

export type LatencyHop = keyof LatencyHops

export const LATENCY_HOPS: readonly LatencyHop[] = ['wait', 'infer', 'handoff', 'respond', 'total']

export interface LatencySummary {
  /** Samples completed so far (capped at the ring size). */
  count: number
  /** Whether the camera stamp came from real capture metadata rather than the callback time. */
  cameraStampReal: boolean
  p50: LatencyHops
  p95: LatencyHops
}

export interface LatencyProbeParams {
  /** |Δroll| that starts a sample. */
  rollThreshold: number
  /** Radians the bank must move from its value at input time to count as visible. */
  bankThreshold: number
  /** An armed sample older than this is dropped (the input didn't move the plane). */
  timeoutMs: number
  /** Samples kept per hop. */
  ringSize: number
}

export const DEFAULT_LATENCY_PROBE_PARAMS: LatencyProbeParams = {
  rollThreshold: 0.1,
  bankThreshold: (0.5 * Math.PI) / 180,
  timeoutMs: 1000,
  ringSize: 64,
}

function emptyHops(): LatencyHops {
  return { wait: 0, infer: 0, handoff: 0, respond: 0, total: 0 }
}

export function createLatencySummary(): LatencySummary {
  return { count: 0, cameraStampReal: false, p50: emptyHops(), p95: emptyHops() }
}

export class LatencyProbe {
  private readonly rings: Record<LatencyHop, Float32Array>
  private readonly scratch: Float32Array
  private head = 0
  private count = 0

  // Latest pose pipeline stamps, carried into the next input.
  private cameraMs = Number.NaN
  private cameraStampReal = false
  private detectStartMs = Number.NaN
  private detectEndMs = Number.NaN
  private detectCameraMs = Number.NaN

  // The armed sample.
  private armed = false
  private armedInputMs = 0
  private armedBank = 0
  private armedCameraMs = Number.NaN
  private armedDetectStartMs = Number.NaN
  private armedDetectEndMs = Number.NaN

  private lastRoll = 0
  private lastBank = 0

  constructor(private readonly params: LatencyProbeParams = DEFAULT_LATENCY_PROBE_PARAMS) {
    const size = params.ringSize
    this.rings = {
      wait: new Float32Array(size),
      infer: new Float32Array(size),
      handoff: new Float32Array(size),
      respond: new Float32Array(size),
      total: new Float32Array(size),
    }
    this.scratch = new Float32Array(size)
  }

  /** A camera frame is available. `captureMs` is its capture time if the browser reports one. */
  markCameraFrame(captureMs: number, nowMs: number, stampReal: boolean): void {
    this.cameraMs = stampReal ? captureMs : nowMs
    this.cameraStampReal = stampReal
  }

  /** A detection ran on the latest camera frame. */
  markDetect(startMs: number, endMs: number): void {
    this.detectStartMs = startMs
    this.detectEndMs = endMs
    this.detectCameraMs = this.cameraMs
  }

  /** A `ControlInput` was written. Arms a sample when the roll jumped. */
  markInput(roll: number, nowMs: number): void {
    const jumped = Math.abs(roll - this.lastRoll) >= this.params.rollThreshold
    this.lastRoll = roll
    if (!jumped || this.armed) return
    this.armed = true
    this.armedInputMs = nowMs
    this.armedBank = this.lastBank
    // Only a detection newer than the last input counts as this input's source.
    const fromPose = this.detectEndMs <= nowMs && Number.isFinite(this.detectEndMs)
    this.armedCameraMs = fromPose ? this.detectCameraMs : Number.NaN
    this.armedDetectStartMs = fromPose ? this.detectStartMs : Number.NaN
    this.armedDetectEndMs = fromPose ? this.detectEndMs : Number.NaN
  }

  /** The flight step ran for this frame. Completes the armed sample once the bank moved. */
  markFrame(bank: number, nowMs: number): void {
    this.lastBank = bank
    if (!this.armed) return
    if (nowMs - this.armedInputMs > this.params.timeoutMs) {
      this.armed = false
      return
    }
    if (Math.abs(bank - this.armedBank) < this.params.bankThreshold) return
    this.armed = false
    const i = this.head
    const respond = nowMs - this.armedInputMs
    const hasCamera = Number.isFinite(this.armedCameraMs)
    this.rings.wait[i] = hasCamera ? this.armedDetectStartMs - this.armedCameraMs : Number.NaN
    this.rings.infer[i] = hasCamera ? this.armedDetectEndMs - this.armedDetectStartMs : Number.NaN
    this.rings.handoff[i] = hasCamera ? this.armedInputMs - this.armedDetectEndMs : Number.NaN
    this.rings.respond[i] = respond
    this.rings.total[i] = hasCamera ? nowMs - this.armedCameraMs : Number.NaN
    this.head = (i + 1) % this.params.ringSize
    if (this.count < this.params.ringSize) this.count += 1
  }

  /** Is a sample waiting for the bank to move? For tests and the HUD. */
  get isArmed(): boolean {
    return this.armed
  }

  /** p50 and p95 of every hop into `out`. Hops with no data (keyboard) read 0. */
  summarize(out: LatencySummary): LatencySummary {
    out.count = this.count
    out.cameraStampReal = this.cameraStampReal
    for (const hop of LATENCY_HOPS) {
      const ring = this.rings[hop]
      let n = 0
      for (let i = 0; i < this.count; i++) {
        const v = ring[i] ?? Number.NaN
        if (Number.isFinite(v)) this.scratch[n++] = v
      }
      const filled = this.scratch.subarray(0, n)
      filled.sort()
      out.p50[hop] = percentile(filled, n, 0.5)
      out.p95[hop] = percentile(filled, n, 0.95)
    }
    return out
  }

  reset(): void {
    this.head = 0
    this.count = 0
    this.armed = false
  }
}

/** The one probe the pose service, input store and render loop all write to. */
export const latencyProbe = new LatencyProbe()
