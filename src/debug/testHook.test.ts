import { afterEach, describe, expect, it } from 'vitest'
import { installTestHook } from './testHook'

afterEach(() => {
  delete window.__driftwing
})

describe('installTestHook', () => {
  it('stays off for players', () => {
    installTestHook('')
    installTestHook('?input=pose')
    expect(window.__driftwing).toBeUndefined()
  })

  it.each(['?debug', '?input=replay'])('installs under %s and reads the stores', (search) => {
    installTestHook(search)
    const snap = window.__driftwing?.snapshot()
    expect(snap?.game).toBe('title')
    expect(snap?.input.source).toBe('keyboard')
    expect(snap?.replay.phase).toBe('idle')
    expect(Number.isFinite(snap?.flight.altitude)).toBe(true)
  })
})
