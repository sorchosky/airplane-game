import { describe, expect, it } from 'vitest'
import { DEFAULT_FLIGHT_PARAMS } from '../flight/flightModel'
import { DEFAULT_GESTURE_PARAMS } from '../pose/gesture'
import { BASELINE_CHAIN, summarizeTilt, type ChainParams } from './latencyChain'

// The constants before #66, for the before-and-after table in docs/decisions.md and the PR.
const BEFORE: ChainParams = {
  ...BASELINE_CHAIN,
  predict: false,
  gesture: {
    ...DEFAULT_GESTURE_PARAMS,
    predictionGain: 0,
    oneEuro: { minCutoff: 1, beta: 0.3, dCutoff: 1 },
  },
  flight: {
    ...DEFAULT_FLIGHT_PARAMS,
    bankSmoothTime: 0.35,
    pitchSmoothTime: 0.45,
    maxBankRate: Infinity,
    maxPitchRate: Infinity,
  },
}
const AFTER: ChainParams = { ...BASELINE_CHAIN, predict: true }

describe('gesture-to-bank chain (#66)', () => {
  it('is deterministic', () => {
    expect(summarizeTilt(AFTER, 20)).toEqual(summarizeTilt(AFTER, 20))
  })

  it('shows a 20° tilt in under 120 ms at 20 Hz, and sooner at 30 Hz', () => {
    const at20 = summarizeTilt(AFTER, 20)
    const at30 = summarizeTilt({ ...AFTER, detectionHz: 30 }, 20)
    expect(at20.firstMotionMs).toBeLessThan(120)
    expect(at30.firstMotionMs).toBeLessThan(at20.firstMotionMs)
  })

  it('reaches half bank at least 25 % sooner on small and medium tilts', () => {
    for (const tilt of [10, 20]) {
      const before = summarizeTilt(BEFORE, tilt)
      const after = summarizeTilt(AFTER, tilt)
      expect(after.halfBankMs, `${tilt}°`).toBeLessThan(before.halfBankMs * 0.75)
      expect(after.firstMotionMs, `${tilt}°`).toBeLessThanOrEqual(before.firstMotionMs)
    }
  })

  it('builds a full tilt at the rate cap: the weight, but never slower than before', () => {
    const before = summarizeTilt(BEFORE, 35)
    const after = summarizeTilt(AFTER, 35)
    expect(after.halfBankMs).toBeLessThanOrEqual(before.halfBankMs)
    expect(after.firstMotionMs).toBeLessThanOrEqual(before.firstMotionMs)
  })

  it('overshoots a held tilt by less than reads on screen, even at the slower detection rates', () => {
    for (const detectionHz of [12, 20, 30]) {
      for (const tilt of [10, 20, 35]) {
        const { overshoot, overshootDeg } = summarizeTilt({ ...AFTER, detectionHz }, tilt)
        const label = `${tilt}° at ${detectionHz} Hz`
        expect(overshootDeg, label).toBeLessThan(0.5)
        expect(overshoot, label).toBeLessThan(0.05)
      }
    }
  })
})
