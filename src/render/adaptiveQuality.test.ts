import { describe, expect, it } from 'vitest'
import {
  buildLadder,
  createGovernorState,
  DEFAULT_GOVERNOR_PARAMS,
  describeRung,
  getBudgetFlag,
  stepGovernor,
  type GovernorState,
  type QualitySettings,
} from './adaptiveQuality'

const DESKTOP: QualitySettings = { dpr: 1.5, tier: 'high', foliageDensity: 1, viewDistance: 10_000 }
const PHONE: QualitySettings = { ...DESKTOP, tier: 'medium' }
const BUDGET = DEFAULT_GOVERNOR_PARAMS.budgetMs

describe('buildLadder', () => {
  it('gives things up in the issue order on a high-DPR desktop', () => {
    const ladder = buildLadder(DESKTOP, 2)
    expect(ladder.map((_, i) => describeRung(ladder, i))).toEqual([
      'top',
      'dpr 1.25',
      'dpr 1',
      'dpr 0.75',
      'post medium',
      'post low',
      'foliage 60%',
      'foliage 30%',
      'view 7 km',
    ])
    expect(ladder.at(-1)).toEqual({
      dpr: 0.75,
      tier: 'low',
      foliageDensity: 0.3,
      viewDistance: 7000,
    })
  })

  it('skips the high tier for a phone that starts on medium', () => {
    const ladder = buildLadder(PHONE, 3)
    expect(ladder.map((r) => r.tier)).not.toContain('high')
    expect(ladder).toHaveLength(8)
  })

  it('collapses pixel ratios above the screen into one rung', () => {
    const ladder = buildLadder(DESKTOP, 1)
    expect(ladder[0]?.dpr).toBe(1)
    expect(describeRung(ladder, 1)).toBe('dpr 0.75')
  })
})

describe('stepGovernor', () => {
  const RUNGS = 9

  /** Feeds `p95Ms` every 500 ms from `fromMs` for `forMs`, returning the state and changes. */
  function feed(state: GovernorState, p95Ms: number, fromMs: number, forMs: number) {
    const changes: { change: string; atMs: number; rung: number }[] = []
    for (let t = fromMs; t <= fromMs + forMs; t += 500) {
      const result = stepGovernor(state, { p95Ms, nowMs: t }, RUNGS)
      state = result.state
      if (result.change) changes.push({ change: result.change, atMs: t, rung: state.rung })
    }
    return { state, changes }
  }

  it('steps down after 3 s over budget, one rung at a time', () => {
    const { state, changes } = feed(createGovernorState(), BUDGET * 1.5, 0, 7000)
    expect(changes.map((c) => c.atMs)).toEqual([3000, 6500])
    expect(state.rung).toBe(2)
  })

  it('does not step down on a brief spike', () => {
    let { state } = feed(createGovernorState(), BUDGET * 2, 0, 2500)
    ;({ state } = feed(state, BUDGET * 0.8, 3000, 500))
    const after = feed(state, BUDGET * 2, 4000, 2500)
    expect(after.changes).toEqual([])
  })

  it('steps up after 10 s under 70 % of budget, never past the top', () => {
    const { state, changes } = feed(createGovernorState(2), BUDGET * 0.5, 0, 40_000)
    expect(changes.map((c) => c.atMs)).toEqual([10_000, 20_500])
    expect(state.rung).toBe(0)
  })

  it('holds between 70 % and 100 % of budget', () => {
    expect(feed(createGovernorState(3), BUDGET * 0.85, 0, 60_000).changes).toEqual([])
  })

  it('never stops at the bottom rung', () => {
    const { state } = feed(createGovernorState(8), BUDGET * 3, 0, 20_000)
    expect(state.rung).toBe(8)
  })

  // A machine that holds rung 3 comfortably but can't hold rung 2: without hysteresis it would
  // climb to 2, drop back to 3, and repeat every ~13 s forever.
  it('stops oscillating between a rung that holds and one that does not', () => {
    let state = createGovernorState(3)
    const changes: { change: string; atMs: number }[] = []
    for (let t = 0; t <= 600_000; t += 500) {
      const p95Ms = state.rung <= 2 ? BUDGET * 1.3 : BUDGET * 0.6
      const result = stepGovernor(state, { p95Ms, nowMs: t }, RUNGS)
      state = result.state
      if (result.change) changes.push({ change: result.change, atMs: t })
    }
    const ups = changes.filter((c) => c.change === 'up').map((c) => c.atMs)
    // Retries back off: each gap between attempts is longer than the one before.
    const gaps = ups.slice(1).map((t, i) => t - (ups[i] ?? 0))
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1] ?? 0)
    expect(ups.length).toBeLessThanOrEqual(5)
    expect(state.rung).toBe(3)
  })

  it('returns the same state object while nothing changes', () => {
    const state = createGovernorState(1)
    const first = stepGovernor(state, { p95Ms: BUDGET * 0.85, nowMs: 0 }, RUNGS)
    expect(first.state).toBe(state)
  })
})

describe('getBudgetFlag', () => {
  it('reads a positive number of ms', () => {
    expect(getBudgetFlag('?debug&budget=8')).toBe(8)
    expect(getBudgetFlag('?budget=abc')).toBeNull()
    expect(getBudgetFlag('?budget=0')).toBeNull()
    expect(getBudgetFlag('')).toBeNull()
  })
})
