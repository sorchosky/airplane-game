/**
 * Diagnostic trace for the "your phone is getting warm" caption (#61). Pure: no React, Three or
 * store imports. The caption fires on slow frames at the lowest tier, which is only a proxy for
 * heat, so this keeps what the phone saw in the seconds before it fired and guesses why.
 */

export interface ThermalTraceSample {
  /** ms since the HUD mounted (flight start). */
  atMs: number
  /** Mean frame time over the last second, ms. */
  frameMs: number
  p95Ms: number
  p99Ms: number
  tier: string
  /** Governor rung, 1-based, as the perf HUD shows it. */
  rung: number
  dpr: number
}

/** About two minutes at the probe's one sample a second. */
export const THERMAL_TRACE_LENGTH = 120

/** A steady 30 Hz cadence: Low Power Mode, a mirroring cap, or a 30 Hz display mode. */
const CAP_FRAME_MS = [31.5, 35] as const
/** p95 this close to the mean means every frame is about the same length: a cap, not stalls. */
const CAP_SPREAD = 1.1

export type WarmCause = 'refresh-cap' | 'slow-frames'

/**
 * `refresh-cap` when frames arrive evenly at about 30 fps (nothing is struggling, the browser is
 * being paced), `slow-frames` when the length varies or sits well past 30 fps (the scene, pose
 * inference or the GPU can't keep up, which is the case heat would also cause).
 */
export function classifyWarm(sample: ThermalTraceSample): WarmCause {
  const steady =
    sample.frameMs >= CAP_FRAME_MS[0] &&
    sample.frameMs <= CAP_FRAME_MS[1] &&
    sample.p95Ms <= sample.frameMs * CAP_SPREAD
  return steady ? 'refresh-cap' : 'slow-frames'
}

/** Appends, dropping the oldest past `THERMAL_TRACE_LENGTH`. Returns a new array. */
export function pushTraceSample(
  trace: readonly ThermalTraceSample[],
  sample: ThermalTraceSample,
): ThermalTraceSample[] {
  const next = [...trace, sample]
  return next.length > THERMAL_TRACE_LENGTH ? next.slice(next.length - THERMAL_TRACE_LENGTH) : next
}

/** One line per sample, for the console. */
export function formatTrace(trace: readonly ThermalTraceSample[]): string {
  return trace
    .map(
      (s) =>
        `${(s.atMs / 1000).toFixed(0).padStart(4)}s  ${s.frameMs.toFixed(1)} ms  ` +
        `p95 ${s.p95Ms.toFixed(1)}  p99 ${s.p99Ms.toFixed(1)}  ${s.tier}  rung ${s.rung}  dpr ${s.dpr.toFixed(2)}`,
    )
    .join('\n')
}
