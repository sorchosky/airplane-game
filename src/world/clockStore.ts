import { create } from 'zustand'
import { activeShot } from '../debug/shots'
import {
  advanceMinutes,
  clearSavedClock,
  formatClock,
  halfHourIndex,
  localClockMinutes,
  resolveClockConfig,
} from './gameClock'

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

/** Continuous clock time. Stepped in place so a frame never allocates (#60). */
export interface ClockTime {
  /** In-game minutes since midnight, continuous. The day cycle (#92) reads this. */
  minutes: number
}

interface ClockStore {
  /** Frame-rate value: read with `useClockStore.getState().time.minutes` inside `useFrame`. */
  time: ClockTime
  /** The half-hour readout, `HH:MM`. Changes 48 times a loop, so React may subscribe to it. */
  display: string
  pinned: boolean
  cycleSeconds: number
  /**
   * Advances the clock by `deltaSeconds` of flying time. Writes React-visible state only when the
   * half hour changes. No-op when pinned.
   */
  tick: (deltaSeconds: number) => void
  /** Re-reads URL flags and captures a new local time (tests only in normal app usage). */
  reset: (search?: string, date?: Date) => void
}

function initialState(search: string, date = new Date()) {
  clearSavedClock(storage())
  const shotActive = typeof window === 'undefined' ? false : activeShot() !== null
  const config = resolveClockConfig(search, localClockMinutes(date), shotActive)
  return {
    time: { minutes: config.minutes },
    display: formatClock(config.minutes),
    pinned: config.pinned,
    cycleSeconds: config.cycleSeconds,
  }
}

const currentSearch = (): string => (typeof window === 'undefined' ? '' : window.location.search)

export const useClockStore = create<ClockStore>((set, get) => ({
  ...initialState(currentSearch()),
  tick: (deltaSeconds) => {
    const { time, pinned, cycleSeconds } = get()
    if (pinned) return
    const before = halfHourIndex(time.minutes)
    time.minutes = advanceMinutes(time.minutes, deltaSeconds, cycleSeconds)
    if (halfHourIndex(time.minutes) !== before) {
      set({ display: formatClock(time.minutes) })
    }
  },
  reset: (search = currentSearch(), date = new Date()) => set(initialState(search, date)),
}))
