import { describe, expect, it } from 'vitest'
import { useInputStore } from './inputStore'
import { NEUTRAL_INPUT } from './types'

describe('useInputStore', () => {
  it('starts at the neutral input', () => {
    expect(useInputStore.getState().current).toEqual(NEUTRAL_INPUT)
  })

  it('clamps roll, pitch and confidence when setting input', () => {
    useInputStore.getState().setInput({
      roll: 3,
      pitch: -3,
      active: true,
      confidence: 5,
      source: 'keyboard',
    })

    expect(useInputStore.getState().current).toEqual({
      roll: 1,
      pitch: -1,
      active: true,
      confidence: 1,
      source: 'keyboard',
    })
  })
})
