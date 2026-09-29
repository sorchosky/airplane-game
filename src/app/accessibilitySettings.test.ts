import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ACCESSIBILITY_SETTINGS,
  loadAccessibilitySettings,
  parseAccessibilitySettings,
  saveAccessibilitySettings,
} from './accessibilitySettings'

describe('accessibility settings', () => {
  it('validates stored values and falls back safely', () => {
    expect(parseAccessibilitySettings(null)).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS)
    expect(parseAccessibilitySettings('{bad')).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS)
    expect(parseAccessibilitySettings('{"seated":true,"captions":true}')).toEqual({
      seated: true,
      highContrast: false,
      captions: true,
    })
  })

  it('lets URL flags opt in without erasing stored preferences', () => {
    const storage = { getItem: () => '{"highContrast":true}' }
    expect(loadAccessibilitySettings(storage, '?seated&captions')).toEqual({
      seated: true,
      highContrast: true,
      captions: true,
    })
  })

  it('persists the settings and the caption compatibility key', () => {
    const values = new Map<string, string>()
    saveAccessibilitySettings(
      { setItem: (key, value) => values.set(key, value) },
      { seated: false, highContrast: true, captions: true },
    )
    expect(values.get('driftwing.accessibility.v1')).toContain('"highContrast":true')
    expect(values.get('driftwing.captions')).toBe('1')
  })
})
