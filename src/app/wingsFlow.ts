/** The first flight's four short movements. All times are milliseconds on the same clock. */
export type WingsStep = 'left' | 'right' | 'climb' | 'dive' | 'finished' | 'done'

export interface WingsFlow {
  step: WingsStep
  sinceMs: number
  heldSinceMs: number | null
}

export const WINGS_HOLD_MS = 500
export const WINGS_TIMEOUT_MS = 20_000
export const WINGS_FINISH_MS = 2_000

export function createWingsFlow(nowMs: number): WingsFlow {
  return { step: 'left', sinceMs: nowMs, heldSinceMs: null }
}

export function stepWingsFlow(
  flow: WingsFlow,
  bankRadians: number,
  pitchRadians: number,
  nowMs: number,
): WingsFlow {
  if (flow.step === 'done') return flow
  if (flow.step === 'finished')
    return nowMs - flow.sinceMs >= WINGS_FINISH_MS
      ? { step: 'done', sinceMs: nowMs, heldSinceMs: null }
      : flow

  const passed =
    flow.step === 'left'
      ? bankRadians < -Math.PI / 9
      : flow.step === 'right'
        ? bankRadians > Math.PI / 9
        : flow.step === 'climb'
          ? pitchRadians > (8 * Math.PI) / 180
          : pitchRadians < (-8 * Math.PI) / 180
  const heldSinceMs = passed ? (flow.heldSinceMs ?? nowMs) : null
  const completed = passed && nowMs - (heldSinceMs ?? nowMs) >= WINGS_HOLD_MS
  if (!completed && nowMs - flow.sinceMs < WINGS_TIMEOUT_MS)
    return heldSinceMs === flow.heldSinceMs ? flow : { ...flow, heldSinceMs }

  const next: Record<Exclude<WingsStep, 'finished' | 'done'>, WingsStep> = {
    left: 'right',
    right: 'climb',
    climb: 'dive',
    dive: 'finished',
  }
  return { step: next[flow.step], sinceMs: nowMs, heldSinceMs: null }
}

/** A gentle 4 s acceleration starts on the last movement and ends by the success line. */
export function wingsSpeedProgress(flow: WingsFlow, nowMs: number): number {
  if (flow.step === 'finished' || flow.step === 'done') return 1
  return flow.step === 'dive' ? Math.min(1, (nowMs - flow.sinceMs) / 4000) : 0
}
