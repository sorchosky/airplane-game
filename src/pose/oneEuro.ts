/**
 * One Euro filter (Casiez, Roussel, Vogel 2012): a low-pass filter whose cutoff frequency rises
 * with signal speed, so it stays smooth when still and low-lag when moving fast. Chosen over a
 * fixed-cutoff low-pass because TV mirroring already adds ~100-200ms of latency (docs/decisions.md).
 */
export interface OneEuroParams {
  minCutoff: number
  beta: number
  dCutoff: number
}

export const DEFAULT_ONE_EURO_PARAMS: OneEuroParams = {
  minCutoff: 1,
  beta: 0.3,
  dCutoff: 1,
}

export interface OneEuroState {
  initialized: boolean
  xPrev: number
  dxPrev: number
  tPrevMs: number
}

export function createOneEuroState(): OneEuroState {
  return { initialized: false, xPrev: 0, dxPrev: 0, tPrevMs: 0 }
}

function smoothingFactor(cutoffHz: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / dtSeconds)
}

function lowPass(value: number, previous: number, alpha: number): number {
  return alpha * value + (1 - alpha) * previous
}

export interface OneEuroResult {
  value: number
  state: OneEuroState
}

/** `tMs` must be monotonically non-decreasing across calls that share a `state`. */
export function oneEuroFilter(
  x: number,
  tMs: number,
  state: OneEuroState,
  params: OneEuroParams = DEFAULT_ONE_EURO_PARAMS,
): OneEuroResult {
  if (!state.initialized) {
    return { value: x, state: { initialized: true, xPrev: x, dxPrev: 0, tPrevMs: tMs } }
  }

  const dtSeconds = Math.max(1 / 1000, (tMs - state.tPrevMs) / 1000)
  const dx = (x - state.xPrev) / dtSeconds
  const filteredDx = lowPass(dx, state.dxPrev, smoothingFactor(params.dCutoff, dtSeconds))
  const cutoff = params.minCutoff + params.beta * Math.abs(filteredDx)
  const value = lowPass(x, state.xPrev, smoothingFactor(cutoff, dtSeconds))

  return { value, state: { initialized: true, xPrev: value, dxPrev: filteredDx, tPrevMs: tMs } }
}
