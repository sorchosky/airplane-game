import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'

function reset() {
  useGameStore.setState({ state: 'title', errorMessage: null })
}

describe('gameStore transitions', () => {
  beforeEach(reset)

  it('starts on the title screen', () => {
    expect(useGameStore.getState().state).toBe('title')
  })

  it('walks the happy path from title to flying', () => {
    const store = useGameStore.getState()
    store.startPermission()
    expect(useGameStore.getState().state).toBe('permission')

    store.permissionGranted()
    expect(useGameStore.getState().state).toBe('calibrate')

    store.calibrationComplete()
    expect(useGameStore.getState().state).toBe('flying')
  })

  it('skips straight to flying from title in keyboard dev mode', () => {
    useGameStore.getState().skipToFlying()
    expect(useGameStore.getState().state).toBe('flying')
  })

  it('goes to error with a message on permission denial', () => {
    const store = useGameStore.getState()
    store.startPermission()
    store.permissionDenied('no camera')
    expect(useGameStore.getState().state).toBe('error')
    expect(useGameStore.getState().errorMessage).toBe('no camera')
  })

  it('goes to error with a message when the camera fails during calibration', () => {
    const store = useGameStore.getState()
    store.startPermission()
    store.permissionGranted()
    expect(useGameStore.getState().state).toBe('calibrate')

    store.permissionDenied('camera busy')
    expect(useGameStore.getState().state).toBe('error')
    expect(useGameStore.getState().errorMessage).toBe('camera busy')
  })

  it('returns to title from error via retry', () => {
    const store = useGameStore.getState()
    store.startPermission()
    store.permissionDenied('no camera')
    store.retry()
    expect(useGameStore.getState().state).toBe('title')
    expect(useGameStore.getState().errorMessage).toBeNull()
  })

  it('pauses and resumes flight', () => {
    const store = useGameStore.getState()
    store.skipToFlying()
    store.pause()
    expect(useGameStore.getState().state).toBe('paused')
    store.resume()
    expect(useGameStore.getState().state).toBe('flying')
  })

  it('quits to title from flying and from paused', () => {
    const store = useGameStore.getState()
    store.skipToFlying()
    store.quitToTitle()
    expect(useGameStore.getState().state).toBe('title')

    store.skipToFlying()
    store.pause()
    store.quitToTitle()
    expect(useGameStore.getState().state).toBe('title')
  })

  it('ignores invalid transitions as no-ops', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = useGameStore.getState()

    store.calibrationComplete() // not reachable from title
    expect(useGameStore.getState().state).toBe('title')

    store.resume() // not reachable from title
    expect(useGameStore.getState().state).toBe('title')

    warnSpy.mockRestore()
  })
})
