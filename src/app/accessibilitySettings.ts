export interface AccessibilitySettings {
  seated: boolean
  highContrast: boolean
  captions: boolean
}

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  seated: false,
  highContrast: false,
  captions: false,
}

const STORAGE_KEY = 'driftwing.accessibility.v1'

export function parseAccessibilitySettings(raw: string | null): AccessibilitySettings {
  if (!raw) return DEFAULT_ACCESSIBILITY_SETTINGS
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return DEFAULT_ACCESSIBILITY_SETTINGS
    const settings = value as Record<string, unknown>
    return {
      seated: settings.seated === true,
      highContrast: settings.highContrast === true,
      captions: settings.captions === true,
    }
  } catch {
    return DEFAULT_ACCESSIBILITY_SETTINGS
  }
}

export function loadAccessibilitySettings(
  storage: Pick<Storage, 'getItem'> | undefined,
  search = '',
): AccessibilitySettings {
  let stored: string | null = null
  try {
    stored = storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    // Private browsing may deny storage; URL flags still work for this session.
  }
  const settings = parseAccessibilitySettings(stored)
  const flags = new URLSearchParams(search)
  return {
    seated: settings.seated || flags.has('seated'),
    highContrast: settings.highContrast || flags.has('contrast'),
    captions: settings.captions || flags.has('captions'),
  }
}

export function saveAccessibilitySettings(
  storage: Pick<Storage, 'setItem'> | undefined,
  settings: AccessibilitySettings,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings))
    // Keep the compatibility key consumed by the calibration lock-in reveal.
    storage?.setItem('driftwing.captions', settings.captions ? '1' : '0')
  } catch {
    // Settings remain active in memory when storage is unavailable.
  }
}
