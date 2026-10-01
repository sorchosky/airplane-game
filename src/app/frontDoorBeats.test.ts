import { describe, expect, it } from 'vitest'
import { beatFor } from './frontDoorBeats'
import type { ControlMode } from './controlModeStore'
import type { GameState } from './gameStore'

const MODES: ControlMode[] = ['camera', 'mouse', 'touch']

describe('beatFor', () => {
  it.each<[GameState, string]>([
    ['title', 'masthead'],
    ['select', 'choose'],
    ['calibrate', 'position'],
    ['wings', 'flight'],
    ['flying', 'flight'],
    ['paused', 'flight'],
    ['error', 'masthead'],
  ])('%s is the %s beat in every control mode', (state, beat) => {
    for (const mode of MODES) expect(beatFor(state, mode)).toBe(beat)
  })

  it('permission follows the control mode', () => {
    expect(beatFor('permission', 'camera')).toBe('position')
    expect(beatFor('permission', 'mouse')).toBe('masthead')
    expect(beatFor('permission', 'touch')).toBe('masthead')
  })

  it('quit to title from any flight state returns to the masthead', () => {
    expect(beatFor('paused', 'camera')).toBe('flight')
    expect(beatFor('title', 'camera')).toBe('masthead')
  })
})
