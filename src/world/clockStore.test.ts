import { beforeEach, describe, expect, it } from 'vitest'
import { useClockStore } from './clockStore'

const KEY = 'skyborne.clock.minutes'

describe('clockStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useClockStore.getState().reset('', new Date(2026, 6, 4, 13, 47))
  })

  it('starts from the device-local minute', () => {
    expect(useClockStore.getState().display).toBe('13:30')
    expect(useClockStore.getState().time.minutes).toBe(13 * 60 + 47)
  })

  it('steps time in place and re-publishes the display only on a half-hour tick', () => {
    const { time } = useClockStore.getState()
    const before = useClockStore.getState()
    useClockStore.getState().tick(1) // 4.8 in-game minutes
    expect(useClockStore.getState().time).toBe(time)
    expect(useClockStore.getState()).toBe(before)
    expect(time.minutes).toBeCloseTo(13 * 60 + 51.8)
    expect(localStorage.getItem(KEY)).toBeNull()

    useClockStore.getState().tick(3) // crosses 14:00
    expect(useClockStore.getState().display).toBe('14:00')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('ignores and clears a stale saved time', () => {
    localStorage.setItem(KEY, '420')
    useClockStore.getState().reset('', new Date(2026, 6, 4, 21, 12))
    expect(useClockStore.getState().time.minutes).toBe(21 * 60 + 12)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('advances the first flying tick from the held title minute without a discontinuity', () => {
    const held = useClockStore.getState().time.minutes
    expect(held).toBe(13 * 60 + 47)
    useClockStore.getState().tick(1 / 60)
    expect(useClockStore.getState().time.minutes).toBeCloseTo(held + 0.08)
  })

  it('never advances or saves when pinned', () => {
    useClockStore.getState().reset('?time=12:00')
    useClockStore.getState().tick(60)
    expect(useClockStore.getState().display).toBe('12:00')
    expect(useClockStore.getState().time.minutes).toBe(720)
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
