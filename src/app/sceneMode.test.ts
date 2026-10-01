import { describe, expect, it } from 'vitest'
import type { GameState } from './gameStore'
import { sceneModeFor, worldIsVisible } from './sceneMode'

describe('sceneModeFor', () => {
  it.each<GameState>(['title', 'select', 'permission', 'calibrate', 'error'])(
    '%s is attract',
    (state) => expect(sceneModeFor(state)).toBe('attract'),
  )

  it.each<GameState>(['wings', 'flying', 'paused'])('%s is flight', (state) =>
    expect(sceneModeFor(state)).toBe('flight'),
  )
})

describe('worldIsVisible', () => {
  it('holds the frame behind the opaque calibrate and error screens', () => {
    expect(worldIsVisible('calibrate')).toBe(false)
    expect(worldIsVisible('error')).toBe(false)
    expect(worldIsVisible('title')).toBe(true)
    expect(worldIsVisible('flying')).toBe(true)
  })
})
