import { describe, expect, it } from 'vitest'
import { defaultQualityTier, getFxFlag } from './qualityStore'

describe('getFxFlag', () => {
  it('reads each tier', () => {
    expect(getFxFlag('?fx=low')).toBe('low')
    expect(getFxFlag('?fx=medium')).toBe('medium')
    expect(getFxFlag('?fx=high')).toBe('high')
  })

  it('treats off as low', () => {
    expect(getFxFlag('?fx=off')).toBe('low')
  })

  it('returns null when absent or unrecognised', () => {
    expect(getFxFlag('')).toBeNull()
    expect(getFxFlag('?debug')).toBeNull()
    expect(getFxFlag('?fx=ultra')).toBeNull()
    expect(getFxFlag('?fx=')).toBeNull()
  })

  it('coexists with other flags', () => {
    expect(getFxFlag('?input=keyboard&fx=medium&debug')).toBe('medium')
  })
})

describe('defaultQualityTier', () => {
  it('is medium on mobile and high on desktop', () => {
    expect(defaultQualityTier(true)).toBe('medium')
    expect(defaultQualityTier(false)).toBe('high')
  })
})
