import type { QualityTier } from './qualityStore'

/**
 * Frame-time governor (#65). Pure: no React, Three or store imports. Steps quality down one rung
 * when the frame-time p95 stays over budget, and back up when it stays well under, with enough
 * hysteresis that it settles instead of oscillating.
 */

/** Everything the governor can trade for frame time, in the order it gives them up. */
export interface QualitySettings {
  /** Renderer pixel ratio. */
  dpr: number
  tier: QualityTier
  /** 0..1, share of foliage instances drawn (read by the foliage slice, A3). */
  foliageDensity: number
  /** m, how far terrain is built; the far haze closes in with it. */
  viewDistance: number
}

/** The issue's step order. Each list is walked from its first value down. */
export const DPR_STEPS = [1.5, 1.25, 1, 0.75] as const
export const TIER_STEPS: readonly QualityTier[] = ['high', 'medium', 'low']
export const FOLIAGE_STEPS = [1, 0.6, 0.3] as const
export const VIEW_DISTANCE_STEPS = [10_000, 7000] as const

/**
 * Every rung from `start` down, one change per rung, in the issue's order: pixel ratio, then post
 * tier, then foliage, then view distance. Steps that wouldn't change anything are skipped: a phone
 * that starts on `medium` never has a `high` rung, and a pixel ratio above what the screen has
 * (`deviceDpr`) is the same frame as the screen's own, so it isn't a separate rung.
 */
export function buildLadder(start: QualitySettings, deviceDpr: number): QualitySettings[] {
  const effectiveDpr = (dpr: number) => Math.min(dpr, Math.max(deviceDpr, DPR_STEPS.at(-1) ?? 1))
  const first = { ...start, dpr: effectiveDpr(start.dpr) }
  const ladder: QualitySettings[] = [first]
  let current = first

  const push = (change: Partial<QualitySettings>) => {
    current = { ...current, ...change }
    ladder.push(current)
  }
  for (const dpr of DPR_STEPS) {
    const next = effectiveDpr(dpr)
    if (next < current.dpr) push({ dpr: next })
  }
  for (const tier of TIER_STEPS) {
    if (TIER_STEPS.indexOf(tier) > TIER_STEPS.indexOf(current.tier)) push({ tier })
  }
  for (const foliageDensity of FOLIAGE_STEPS) {
    if (foliageDensity < current.foliageDensity) push({ foliageDensity })
  }
  for (const viewDistance of VIEW_DISTANCE_STEPS) {
    if (viewDistance < current.viewDistance) push({ viewDistance })
  }
  return ladder
}

/** Short human label for the change a rung makes relative to the one above it. */
export function describeRung(ladder: readonly QualitySettings[], rung: number): string {
  const here = ladder[rung]
  const above = ladder[rung - 1]
  if (!here) return '?'
  if (!above) return 'top'
  if (here.dpr !== above.dpr) return `dpr ${here.dpr}`
  if (here.tier !== above.tier) return `post ${here.tier}`
  if (here.foliageDensity !== above.foliageDensity) {
    return `foliage ${Math.round(here.foliageDensity * 100)}%`
  }
  return `view ${here.viewDistance / 1000} km`
}

export interface GovernorParams {
  /** ms, the frame-time p95 to hold: 16.7 for 60 fps. `?budget=` overrides it for testing. */
  budgetMs: number
  /** Over budget this long, continuously, steps down one rung. */
  downAfterMs: number
  /** Under `upBelow` × budget this long, continuously, steps up one rung. */
  upAfterMs: number
  upBelow: number
  /**
   * After stepping back down from a rung it just climbed to, climbing to it again waits this long,
   * doubling each time it happens again. This is the anti-oscillation rule: a rung that fails twice
   * is left alone for longer and longer.
   */
  retryCooldownMs: number
  /** A step down this soon after a step up counts as that rung failing. */
  failWindowMs: number
}

export const DEFAULT_GOVERNOR_PARAMS: GovernorParams = {
  budgetMs: 1000 / 60,
  downAfterMs: 3000,
  upAfterMs: 10_000,
  upBelow: 0.7,
  retryCooldownMs: 30_000,
  failWindowMs: 15_000,
}

export type GovernorChange = 'down' | 'up'

export interface GovernorState {
  /** Index into the ladder; 0 is the best-looking rung. */
  rung: number
  overSinceMs: number | null
  underSinceMs: number | null
  lastChange: GovernorChange | null
  lastChangeMs: number
  /** Stepping up to rung `blockedRung` is not allowed before `blockedUntilMs`. */
  blockedRung: number
  blockedUntilMs: number
  /** Current cooldown length; doubles each time a rung fails again. */
  cooldownMs: number
}

export function createGovernorState(
  rung = 0,
  params: GovernorParams = DEFAULT_GOVERNOR_PARAMS,
): GovernorState {
  return {
    rung,
    overSinceMs: null,
    underSinceMs: null,
    lastChange: null,
    lastChangeMs: -Infinity,
    blockedRung: -1,
    blockedUntilMs: -Infinity,
    cooldownMs: params.retryCooldownMs,
  }
}

export interface GovernorSample {
  /** Frame-time p95 over the recent window (about 3 s). */
  p95Ms: number
  nowMs: number
}

export interface GovernorStepResult {
  state: GovernorState
  /** Set on the sample that moves to a new rung; the caller applies it and resets its window. */
  change: GovernorChange | null
}

/**
 * Feeds one p95 sample (a few per second). Returns the same `state` object when nothing changed.
 * `rungCount` is the ladder length.
 */
export function stepGovernor(
  state: GovernorState,
  sample: GovernorSample,
  rungCount: number,
  params: GovernorParams = DEFAULT_GOVERNOR_PARAMS,
): GovernorStepResult {
  const { p95Ms, nowMs } = sample
  const over = p95Ms > params.budgetMs
  const under = p95Ms < params.budgetMs * params.upBelow

  const overSinceMs = over ? (state.overSinceMs ?? nowMs) : null
  const underSinceMs = under ? (state.underSinceMs ?? nowMs) : null

  if (over && nowMs - (overSinceMs ?? nowMs) >= params.downAfterMs && state.rung < rungCount - 1) {
    // A drop soon after climbing means the rung we climbed to can't hold: block it, and back off
    // for longer each time it happens again.
    const failedClimb =
      state.lastChange === 'up' && nowMs - state.lastChangeMs <= params.failWindowMs
    const cooldownMs = failedClimb ? state.cooldownMs * 2 : state.cooldownMs
    return {
      change: 'down',
      state: {
        ...state,
        rung: state.rung + 1,
        overSinceMs: null,
        underSinceMs: null,
        lastChange: 'down',
        lastChangeMs: nowMs,
        blockedRung: failedClimb ? state.rung : state.blockedRung,
        blockedUntilMs: failedClimb ? nowMs + state.cooldownMs : state.blockedUntilMs,
        cooldownMs,
      },
    }
  }

  const target = state.rung - 1
  const blocked = target === state.blockedRung && nowMs < state.blockedUntilMs
  if (under && !blocked && target >= 0 && nowMs - (underSinceMs ?? nowMs) >= params.upAfterMs) {
    return {
      change: 'up',
      state: {
        ...state,
        rung: target,
        overSinceMs: null,
        underSinceMs: null,
        lastChange: 'up',
        lastChangeMs: nowMs,
      },
    }
  }

  if (overSinceMs === state.overSinceMs && underSinceMs === state.underSinceMs) {
    return { state, change: null }
  }
  return { state: { ...state, overSinceMs, underSinceMs }, change: null }
}

/** `?budget=<ms>` for testing the governor on a fast machine (e.g. `?budget=8`). */
export function getBudgetFlag(search: string): number | null {
  const value = Number(new URLSearchParams(search).get('budget'))
  return Number.isFinite(value) && value > 0 ? value : null
}
