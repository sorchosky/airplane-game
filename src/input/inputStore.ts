import { create } from 'zustand'
import { clampAxis, clampConfidence } from './clamp'
import { NEUTRAL_INPUT, type ControlInput } from './types'

interface InputStore {
  current: ControlInput
  setInput: (input: ControlInput) => void
}

export const useInputStore = create<InputStore>((set) => ({
  current: NEUTRAL_INPUT,
  setInput: (input) =>
    set({
      current: {
        ...input,
        roll: clampAxis(input.roll),
        pitch: clampAxis(input.pitch),
        confidence: clampConfidence(input.confidence),
      },
    }),
}))
