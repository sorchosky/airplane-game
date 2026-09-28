import { create } from 'zustand'
import {
  loadAccessibilitySettings,
  saveAccessibilitySettings,
  type AccessibilitySettings,
} from './accessibilitySettings'

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function initialSettings(): AccessibilitySettings {
  return loadAccessibilitySettings(
    browserStorage(),
    typeof window === 'undefined' ? '' : window.location.search,
  )
}

interface AccessibilityStore extends AccessibilitySettings {
  toggleSeated: () => void
  toggleHighContrast: () => void
  toggleCaptions: () => void
}

export const useAccessibilityStore = create<AccessibilityStore>((set, get) => {
  const update = (key: keyof AccessibilitySettings) => {
    const current = get()
    const settings: AccessibilitySettings = {
      seated: current.seated,
      highContrast: current.highContrast,
      captions: current.captions,
      [key]: !current[key],
    }
    saveAccessibilitySettings(browserStorage(), settings)
    set(settings)
  }
  return {
    ...initialSettings(),
    toggleSeated: () => update('seated'),
    toggleHighContrast: () => update('highContrast'),
    toggleCaptions: () => update('captions'),
  }
})
