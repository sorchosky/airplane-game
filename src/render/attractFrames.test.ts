import { describe, expect, it } from 'vitest'
import {
  ATTRACT_MAX_FPS,
  REDUCED_MOTION_HOLD_FRAMES,
  attractShouldRender,
  createFrameLimiter,
} from './attractFrames'

describe('createFrameLimiter', () => {
  it('caps a 60 Hz display at 30 fps', () => {
    const limiter = createFrameLimiter(ATTRACT_MAX_FPS)
    let drawn = 0
    for (let i = 0; i < 60; i++) if (limiter.due(i * (1000 / 60))) drawn += 1
    expect(drawn).toBe(30)
  })

  it('does not skip every other frame of a 30 Hz display', () => {
    const limiter = createFrameLimiter(ATTRACT_MAX_FPS)
    let drawn = 0
    for (let i = 0; i < 30; i++) if (limiter.due(i * 33.2)) drawn += 1
    expect(drawn).toBe(30)
  })

  it('never exceeds the cap on a 144 Hz display', () => {
    const limiter = createFrameLimiter(ATTRACT_MAX_FPS)
    let drawn = 0
    for (let i = 0; i < 144; i++) if (limiter.due(i * (1000 / 144))) drawn += 1
    expect(drawn).toBeLessThanOrEqual(31)
  })

  it('holds a slow device to a third of the main thread', () => {
    const limiter = createFrameLimiter(ATTRACT_MAX_FPS)
    let drawn = 0
    // 150 ms frames on a 60 Hz display, for 3 s: one frame per 450 ms, not one per 33.
    for (let i = 0; i < 180; i++) if (limiter.due(i * (1000 / 60), 150)) drawn += 1
    expect(drawn).toBeLessThanOrEqual(7)
    expect(drawn).toBeGreaterThanOrEqual(6)
  })

  it('leaves a fast device at the cap', () => {
    const limiter = createFrameLimiter(ATTRACT_MAX_FPS)
    let drawn = 0
    for (let i = 0; i < 60; i++) if (limiter.due(i * (1000 / 60), 4)) drawn += 1
    expect(drawn).toBe(30)
  })

  it('renders the first frame immediately', () => {
    expect(createFrameLimiter(ATTRACT_MAX_FPS).due(5000)).toBe(true)
  })
})

describe('attractShouldRender', () => {
  const live = {
    hidden: false,
    covered: false,
    reducedMotion: false,
    ready: true,
    framesSinceReady: 100,
  }

  it('renders while visible', () => expect(attractShouldRender(live)).toBe(true))

  it('stops while the document is hidden', () =>
    expect(attractShouldRender({ ...live, hidden: true })).toBe(false))

  it('stops while an opaque screen covers the world', () =>
    expect(attractShouldRender({ ...live, covered: true })).toBe(false))

  it('under reduced motion keeps rendering until the world is ready, then holds one frame', () => {
    const reduced = { ...live, reducedMotion: true }
    expect(attractShouldRender({ ...reduced, ready: false, framesSinceReady: 0 })).toBe(true)
    expect(attractShouldRender({ ...reduced, framesSinceReady: 0 })).toBe(true)
    expect(attractShouldRender({ ...reduced, framesSinceReady: REDUCED_MOTION_HOLD_FRAMES })).toBe(
      false,
    )
  })
})
