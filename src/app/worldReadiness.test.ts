import { describe, expect, it } from 'vitest'
import { MIN_READY_FRAMES, isWorldReady } from './worldReadiness'

const ready = { terrainReady: true, terrainTiles: 12, framesRendered: MIN_READY_FRAMES }

describe('isWorldReady', () => {
  it('is ready once the terrain is drawn and a few frames have rendered', () => {
    expect(isWorldReady(ready)).toBe(true)
  })

  it('waits for the streamer', () => {
    expect(isWorldReady({ ...ready, terrainReady: false })).toBe(false)
  })

  it('does not count an empty layout as ready', () => {
    expect(isWorldReady({ ...ready, terrainTiles: 0 })).toBe(false)
  })

  it('waits for the first frames', () => {
    expect(isWorldReady({ ...ready, framesRendered: MIN_READY_FRAMES - 1 })).toBe(false)
    expect(isWorldReady({ ...ready, framesRendered: 0 })).toBe(false)
  })
})
