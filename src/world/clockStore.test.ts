import { beforeEach, describe, expect, it } from 'vitest'
import { useClockStore } from './clockStore'

const KEY = 'skyborne.clock.minutes'

describe('clockStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useClockStore.getState().reset('')
  })

  it('starts a first flight at 07:00', () => {
    expect(useClockStore.getState().display).toBe('07:00')
    expect(useClockStore.getState().time.minutes).toBe(420)
  })

  it('steps time in place and re-publishes the display only on a half-hour tick', () => {
    const { time } = useClockStore.getState()
    const before = useClockStore.getState()
    useClockStore.getState().tick(1) // 4.8 in-game minutes
    expect(useClockStore.getState().time).toBe(time)
    expect(useClockStore.getState()).toBe(before)
    expect(time.minutes).toBeCloseTo(424.8)
    expect(localStorage.getItem(KEY)).toBeNull()

    useClockStore.getState().tick(6) // crosses 07:30
    expect(useClockStore.getState().display).toBe('07:30')
    expect(Number(localStorage.getItem(KEY))).toBeCloseTo(453.6)
  })

  it('resumes from the saved time after a reload', () => {
    useClockStore.getState().tick(20)
    useClockStore.getState().save()
    const saved = useClockStore.getState().time.minutes
    useClockStore.getState().reset('')
    expect(useClockStore.getState().time.minutes).toBeCloseTo(saved)
  })

  it('never advances or saves when pinned', () => {
    useClockStore.getState().reset('?time=12:00')
    useClockStore.getState().tick(60)
    useClockStore.getState().save()
    expect(useClockStore.getState().display).toBe('12:00')
    expect(useClockStore.getState().time.minutes).toBe(720)
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
