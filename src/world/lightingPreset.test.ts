import { describe, expect, it } from 'vitest'
import { DEFAULT_LIGHTING_PRESET } from '../styles/tokens'
import { getTimeOfDayFromUrl } from './lightingPreset'

describe('getTimeOfDayFromUrl', () => {
  it('defaults to the morning preset (palette B)', () => {
    expect(DEFAULT_LIGHTING_PRESET).toBe('morning')
    expect(getTimeOfDayFromUrl('')).toBe('morning')
    expect(getTimeOfDayFromUrl('?debug&input=keyboard')).toBe('morning')
  })

  it('reads the golden-hour aliases, case-insensitively', () => {
    for (const value of ['golden', 'golden-hour', 'goldenhour', 'Golden']) {
      expect(getTimeOfDayFromUrl(`?tod=${value}`)).toBe('goldenHour')
    }
    expect(getTimeOfDayFromUrl('?tod=morning')).toBe('morning')
  })

  it('falls back to the default for an unknown value', () => {
    expect(getTimeOfDayFromUrl('?tod=midnight')).toBe('morning')
    expect(getTimeOfDayFromUrl('?tod=')).toBe('morning')
  })
})
