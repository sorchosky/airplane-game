import { useEffect } from 'react'
import { useClockStore } from '../world/clockStore'
import { FRAME_PRIORITY, frameLoop } from './frameLoop'
import { useGameStore } from './gameStore'

/**
 * Longest frame the clock will count, s. A stalled frame (GC, a thermal hitch, the first frame
 * back from a hidden tab) must not jump the time of day.
 */
const MAX_CLOCK_STEP_S = 0.25

/**
 * Drives the in-game clock (#94) while the flight scene is up. It advances only in `flying`:
 * pause, the resume countdown (still `paused`) and a hidden tab freeze it. Because the store lives
 * for the page lifetime, quitting to title holds the current minute without persistence.
 */
export function useGameClock(): void {
  useEffect(() => {
    const remove = frameLoop.add((_nowMs, deltaMs) => {
      if (useGameStore.getState().state !== 'flying' || document.hidden) return
      useClockStore.getState().tick(Math.min(deltaMs / 1000, MAX_CLOCK_STEP_S))
    }, FRAME_PRIORITY.clock)

    return () => {
      remove()
    }
  }, [])
}
