/**
 * Timing for the failure states the phone can throw mid-session (#61). Pure: no DOM, React or
 * store imports, so the rules are unit tested apart from the browser events that feed them.
 */

/** First camera retry after the stream is lost; each further attempt doubles, up to the cap. */
export const CAMERA_RETRY_BASE_MS = 1000
export const CAMERA_RETRY_MAX_MS = 8000

/** Delay before retry number `attempt` (0-based): 1 s, 2 s, 4 s, then every 8 s. */
export function cameraRetryDelayMs(attempt: number): number {
  return Math.min(CAMERA_RETRY_BASE_MS * 2 ** Math.max(0, attempt), CAMERA_RETRY_MAX_MS)
}

/**
 * A muted track (iOS hands the camera to another app, or the OS throttles it) may come back by
 * itself. Wait this long for `unmute` before tearing the stream down and asking again.
 */
export const CAMERA_MUTE_GRACE_MS = 3000

export interface ThermalWatchParams {
  /** Frame-time p95 above this counts as struggling (under 30 fps). */
  p95ThresholdMs: number
  /** How long it must stay above the threshold, continuously, before the caption shows. */
  sustainMs: number
}

export const DEFAULT_THERMAL_WATCH_PARAMS: ThermalWatchParams = {
  p95ThresholdMs: 33,
  sustainMs: 10_000,
}

export interface ThermalWatchState {
  /** When the current run of slow samples started, or null when the last sample was fine. */
  overSinceMs: number | null
  /** The caption has been shown; it never shows twice. */
  warned: boolean
}

export const INITIAL_THERMAL_WATCH: ThermalWatchState = { overSinceMs: null, warned: false }

export interface ThermalSample {
  p95Ms: number
  /** Quality tier in use. Only `low` counts: above it, the adaptive tier (E3) steps down first. */
  tier: string
  nowMs: number
}

export interface ThermalStepResult {
  state: ThermalWatchState
  /** True on the one sample that should show the "getting warm" caption. */
  warn: boolean
}

/**
 * Thermal throttling proxy, fed about once a second. The caption shows once, after the frame-time
 * p95 has stayed over the threshold on the `low` tier for `sustainMs`. Any good sample, or a tier
 * change, restarts the run.
 */
export function stepThermalWatch(
  state: ThermalWatchState,
  sample: ThermalSample,
  params: ThermalWatchParams = DEFAULT_THERMAL_WATCH_PARAMS,
): ThermalStepResult {
  if (state.warned) return { state, warn: false }
  const slow = sample.tier === 'low' && sample.p95Ms > params.p95ThresholdMs
  if (!slow) {
    return { state: state.overSinceMs === null ? state : INITIAL_THERMAL_WATCH, warn: false }
  }
  const overSinceMs = state.overSinceMs ?? sample.nowMs
  if (sample.nowMs - overSinceMs >= params.sustainMs) {
    return { state: { overSinceMs, warned: true }, warn: true }
  }
  return {
    state: overSinceMs === state.overSinceMs ? state : { overSinceMs, warned: false },
    warn: false,
  }
}
