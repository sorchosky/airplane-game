import { create } from 'zustand'
import type { ThermalTraceSample, WarmCause } from './thermalTrace'

// What the warm-caption watch has seen. Written by `WarmCaption` about once a second, read by
// `PerfHud` with `getState()`, never as React state.
interface ThermalStore {
  /** How long the current run of slow samples has lasted, ms. 0 when the last sample was fine. */
  overForMs: number
  /** The sample the caption fired on, with the guessed cause, or null if it hasn't fired. */
  fired: { sample: ThermalTraceSample; cause: WarmCause } | null
}

export const useThermalStore = create<ThermalStore>(() => ({ overForMs: 0, fired: null }))
