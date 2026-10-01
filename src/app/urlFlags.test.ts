import { describe, expect, it } from 'vitest'
import { isCastMode } from './urlFlags'

describe('isCastMode', () => {
  it('is on for ?cast and off when absent or zeroed', () => {
    expect(isCastMode('?debug&cast')).toBe(true)
    expect(isCastMode('?cast=1')).toBe(true)
    expect(isCastMode('?cast=0')).toBe(false)
    expect(isCastMode('?cast=false')).toBe(false)
    expect(isCastMode('?debug')).toBe(false)
    expect(isCastMode('')).toBe(false)
  })
})
