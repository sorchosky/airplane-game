import { describe, expect, it } from 'vitest'
import { loadMuted, saveMuted } from './audioSettings'

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

describe('load/saveMuted', () => {
  it('round-trips through storage, defaulting to unmuted', () => {
    const storage = memoryStorage()
    expect(loadMuted(storage)).toBe(false)
    saveMuted(storage, true)
    expect(loadMuted(storage)).toBe(true)
    saveMuted(storage, false)
    expect(loadMuted(storage)).toBe(false)
  })

  it('fails closed (unmuted) and never throws when storage is unavailable', () => {
    expect(loadMuted(undefined)).toBe(false)
    expect(loadMuted(throwing)).toBe(false)
    expect(() => saveMuted(throwing, true)).not.toThrow()
    expect(() => saveMuted(undefined, true)).not.toThrow()
  })
})
