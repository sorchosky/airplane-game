import { create } from 'zustand'
import { latencyProbe } from '../debug/latencyProbe'
import { clampAxis, clampConfidence } from './clamp'
import { NEUTRAL_INPUT, type ControlInput } from './types'

interface InputStore {
  current: ControlInput
  setInput: (input: ControlInput) => void
}

export const useInputStore = create<InputStore>((set) => ({
  current: NEUTRAL_INPUT,
  setInput: (input) => {
    const roll = clampAxis(input.roll)
    // Every write passes here, whatever the source, so this is where a latency sample arms.
    latencyProbe.markInput(roll, performance.now())
    set({
      current: {
        ...input,
        roll,
        pitch: clampAxis(input.pitch),
        confidence: clampConfidence(input.confidence),
      },
    })
  },
}))
