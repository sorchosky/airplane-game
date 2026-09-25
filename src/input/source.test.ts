import { describe, expect, it } from 'vitest'
import { getInputSourceFromUrl, hasDebugFlag } from './source'

describe('getInputSourceFromUrl', () => {
  it('defaults to keyboard with no flag', () => {
    expect(getInputSourceFromUrl('')).toBe('keyboard')
  })

  it('reads a valid source from the flag', () => {
    expect(getInputSourceFromUrl('?input=pose')).toBe('pose')
    expect(getInputSourceFromUrl('?input=replay')).toBe('replay')
  })

  it('falls back to keyboard for an unknown value', () => {
    expect(getInputSourceFromUrl('?input=bogus')).toBe('keyboard')
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
