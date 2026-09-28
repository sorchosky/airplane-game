import { describe, expect, it } from 'vitest'
import { computeAudioParams, DEFAULT_AUDIO_TUNABLES, type FlightAudioRange } from './audioParams'

const RANGE: FlightAudioRange = { minSpeed: 32, maxSpeed: 60, maxBankAngle: Math.PI * (50 / 180) }

describe('computeAudioParams', () => {
  it('rises in a dive: faster airspeed alone raises engine pitch', () => {
    const slow = computeAudioParams({ speed: 35, pitchAngle: 0, bank: 0 }, RANGE)
    const diving = computeAudioParams({ speed: 55, pitchAngle: -0.3, bank: 0 }, RANGE)
    expect(diving.engineFreq).toBeGreaterThan(slow.engineFreq)
  })

  it('engine gain and wind gain/cutoff increase monotonically with airspeed', () => {
    const low = computeAudioParams({ speed: 34, pitchAngle: 0, bank: 0 }, RANGE)
    const mid = computeAudioParams({ speed: 46, pitchAngle: 0, bank: 0 }, RANGE)
    const high = computeAudioParams({ speed: 58, pitchAngle: 0, bank: 0 }, RANGE)

    expect(mid.engineFreq).toBeGreaterThan(low.engineFreq)
    expect(high.engineFreq).toBeGreaterThan(mid.engineFreq)
    expect(mid.engineGain).toBeGreaterThan(low.engineGain)
    expect(high.engineGain).toBeGreaterThan(mid.engineGain)
    expect(mid.windGain).toBeGreaterThan(low.windGain)
    expect(high.windGain).toBeGreaterThan(mid.windGain)
    expect(mid.windCutoff).toBeGreaterThan(low.windCutoff)
    expect(high.windCutoff).toBeGreaterThan(mid.windCutoff)
  })

  it('climbing works the engine harder than level flight at the same speed', () => {
    const level = computeAudioParams({ speed: 45, pitchAngle: 0, bank: 0 }, RANGE)
    const climbing = computeAudioParams({ speed: 45, pitchAngle: 0.4, bank: 0 }, RANGE)
    expect(climbing.engineGain).toBeGreaterThan(level.engineGain)
  })

  it('diving never reads as less engine effort than level flight at the same speed', () => {
    const level = computeAudioParams({ speed: 45, pitchAngle: 0, bank: 0 }, RANGE)
    const diving = computeAudioParams({ speed: 45, pitchAngle: -0.4, bank: 0 }, RANGE)
    expect(diving.engineGain).toBeCloseTo(level.engineGain, 5)
  })

  it('wind swells in a hard bank, symmetrically left or right', () => {
    const level = computeAudioParams({ speed: 45, pitchAngle: 0, bank: 0 }, RANGE)
    const bankedRight = computeAudioParams(
      { speed: 45, pitchAngle: 0, bank: RANGE.maxBankAngle },
      RANGE,
    )
    const bankedLeft = computeAudioParams(
      { speed: 45, pitchAngle: 0, bank: -RANGE.maxBankAngle },
      RANGE,
    )

    expect(bankedRight.windGain).toBeGreaterThan(level.windGain)
    expect(bankedRight.windCutoff).toBeGreaterThan(level.windCutoff)
    expect(bankedLeft.windGain).toBeCloseTo(bankedRight.windGain, 5)
    expect(bankedLeft.windCutoff).toBeCloseTo(bankedRight.windCutoff, 5)
  })

  it('clamps to the tunable range even outside the nominal speed/bank envelope', () => {
    const overSpeed = computeAudioParams({ speed: 200, pitchAngle: 1.5, bank: 10 }, RANGE)
    const underSpeed = computeAudioParams({ speed: -50, pitchAngle: -1.5, bank: -10 }, RANGE)

    expect(overSpeed.engineFreq).toBeLessThanOrEqual(DEFAULT_AUDIO_TUNABLES.engineFreqMax)
    expect(overSpeed.engineGain).toBeLessThanOrEqual(DEFAULT_AUDIO_TUNABLES.engineGainMax)
    expect(overSpeed.windGain).toBeLessThanOrEqual(DEFAULT_AUDIO_TUNABLES.windGainMax)
    expect(overSpeed.windCutoff).toBeLessThanOrEqual(DEFAULT_AUDIO_TUNABLES.windCutoffMax)

    expect(underSpeed.engineFreq).toBeGreaterThanOrEqual(DEFAULT_AUDIO_TUNABLES.engineFreqMin)
    expect(underSpeed.engineGain).toBeGreaterThanOrEqual(DEFAULT_AUDIO_TUNABLES.engineGainMin)
    expect(underSpeed.windGain).toBeGreaterThanOrEqual(DEFAULT_AUDIO_TUNABLES.windGainMin)
    expect(underSpeed.windCutoff).toBeGreaterThanOrEqual(DEFAULT_AUDIO_TUNABLES.windCutoffMin)
  })
})

describe('layered audio params', () => {
  it('crossfades engine layers by load and writes into the supplied object', () => {
    const out = { engineFreq: 0, engineGain: 0, windCutoff: 0, windGain: 0 }
    const level = computeAudioParams({ speed: 45, pitchAngle: 0, bank: 0 }, RANGE, undefined, out)
    const levelChug = level.chugGain ?? 0
    const levelBuzz = level.buzzGain ?? 0
    const levelWhine = level.whineGain ?? 0
    const climb = computeAudioParams({ speed: 45, pitchAngle: 0.4, bank: 0 }, RANGE, undefined, out)
    expect(climb).toBe(out)
    expect(climb.chugGain).toBeGreaterThan(0)
    expect(climb.buzzGain).toBeGreaterThan(levelBuzz)
    expect(climb.whineGain).toBeGreaterThan(levelWhine)
    expect((climb.buzzGain ?? 0) / (climb.chugGain ?? 1)).toBeGreaterThan(levelBuzz / levelChug)
  })

  it('builds a ground rush below the soft floor and muffled texture inside clouds', () => {
    const clear = computeAudioParams({ speed: 45, pitchAngle: 0, bank: 0 }, RANGE)
    const low = computeAudioParams({ speed: 45, pitchAngle: 0, bank: 0, floorContact: 0.9 }, RANGE)
    const cloud = computeAudioParams(
      { speed: 45, pitchAngle: 0, bank: 0, cloudInside: true },
      RANGE,
    )
    const above15 = computeAudioParams(
      { speed: 45, pitchAngle: 0, bank: 0, floorContact: 0.24 },
      RANGE,
    )
    expect(clear.lowRushGain).toBe(0)
    expect(above15.lowRushGain).toBe(0)
    expect(low.lowRushGain).toBeGreaterThan(0)
    expect(low.padGain).toBeGreaterThan(clear.padGain ?? 0)
    expect(cloud.textureGain).toBeGreaterThan(clear.textureGain ?? 0)
  })
})
