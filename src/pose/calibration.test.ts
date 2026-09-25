import { describe, expect, it } from 'vitest'
import { loadCalibration, parseCalibration, saveCalibration, type Calibration } from './calibration'

const CAL: Calibration = { neutralRollDeg: -3.5, neutralPitch: 0.1, shoulderWidth: 0.18 }

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

const throwing = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

describe('parseCalibration', () => {
  it('round-trips a valid calibration', () => {
    expect(parseCalibration(JSON.stringify(CAL))).toEqual(CAL)
  })

  it.each([
    ['null', null],
    ['empty', ''],
    ['malformed JSON', '{nope'],
    ['a number', '4'],
    ['missing fields', '{"neutralRollDeg":1}'],
    ['string fields', '{"neutralRollDeg":"1","neutralPitch":0,"shoulderWidth":0.2}'],
    ['zero shoulder width', '{"neutralRollDeg":0,"neutralPitch":0,"shoulderWidth":0}'],
  ])('rejects %s', (_name, raw) => {
    expect(parseCalibration(raw)).toBeNull()
  })
})

describe('load/saveCalibration', () => {
  it('persists through storage', () => {
    const storage = memoryStorage()
    expect(loadCalibration(storage)).toBeNull()
    saveCalibration(storage, CAL)
    expect(loadCalibration(storage)).toEqual(CAL)
  })

  it('tolerates missing or throwing storage', () => {
    expect(loadCalibration(undefined)).toBeNull()
    expect(loadCalibration(throwing)).toBeNull()
    expect(() => saveCalibration(throwing, CAL)).not.toThrow()
    expect(() => saveCalibration(undefined, CAL)).not.toThrow()
  })
})
