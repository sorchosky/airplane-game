import { beforeEach, describe, expect, it } from 'vitest'
import { selectedInputSource, useControlModeStore } from './controlModeStore'

describe('selected input source', () => {
  beforeEach(() => {
    useControlModeStore.setState({ controlMode: 'camera', inputOverride: null })
  })

  it('follows the player choice without a dev preset', () => {
    expect(selectedInputSource()).toBe('pose')
    useControlModeStore.getState().selectMode('mouse')
    expect(selectedInputSource()).toBe('keyboard')
    useControlModeStore.getState().selectMode('touch')
    expect(selectedInputSource()).toBe('keyboard')
  })

  it('preserves keyboard, pose, and replay dev entry points', () => {
    for (const source of ['keyboard', 'pose', 'replay'] as const) {
      useControlModeStore.setState({ inputOverride: source })
      expect(selectedInputSource()).toBe(source)
    }
  })
})
