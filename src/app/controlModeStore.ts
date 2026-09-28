import { create } from 'zustand'
import { getInputOverrideFromUrl, type InputSourceName } from '../input/source'

export type ControlMode = 'camera' | 'mouse' | 'touch'

const override = typeof window === 'undefined' ? null : getInputOverrideFromUrl()

interface ControlModeStore {
  controlMode: ControlMode
  inputOverride: InputSourceName | null
  selectMode: (mode: ControlMode) => void
}

export const useControlModeStore = create<ControlModeStore>((set) => ({
  controlMode: override === 'keyboard' ? 'mouse' : 'camera',
  inputOverride: override,
  selectMode: (controlMode) => set({ controlMode }),
}))

/** The URL is parsed once for dev entry points; player-facing flow follows the selected mode. */
export function selectedInputSource(): InputSourceName {
  const { controlMode, inputOverride } = useControlModeStore.getState()
  return inputOverride ?? (controlMode === 'camera' ? 'pose' : 'keyboard')
}

export function isTouchDevice(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}
