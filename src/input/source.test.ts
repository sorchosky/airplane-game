import { describe, expect, it } from 'vitest'
import { getInputSourceFromUrl, hasDebugFlag } from './source'

describe('getInputSourceFromUrl', () => {
  it('defaults to pose with no flag, matching the calibrate flow Start sends the player through', () => {
    expect(getInputSourceFromUrl('')).toBe('pose')
    expect(getInputSourceFromUrl('?debug')).toBe('pose')
  })

  it('reads a valid source from the flag', () => {
    expect(getInputSourceFromUrl('?input=keyboard')).toBe('keyboard')
    expect(getInputSourceFromUrl('?input=pose')).toBe('pose')
    expect(getInputSourceFromUrl('?input=replay')).toBe('replay')
  })

  it('falls back to pose for an unknown value', () => {
    expect(getInputSourceFromUrl('?input=bogus')).toBe('pose')
  })
})

describe('hasDebugFlag', () => {
  it('is false with no flag', () => {
    expect(hasDebugFlag('')).toBe(false)
  })

  it('is true when ?debug is present', () => {
    expect(hasDebugFlag('?debug')).toBe(true)
    expect(hasDebugFlag('?input=keyboard&debug')).toBe(true)
  })
})
