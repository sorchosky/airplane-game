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
 * pause, the resume countdown (still `paused`) and a hidden tab freeze it. Saves on pause, on quit
 * to title and on unmount, as well as on each half-hour tick (`clockStore.tick`).
 */
export function useGameClock(): void {
  useEffect(() => {
    const remove = frameLoop.add((_nowMs, deltaMs) => {
      if (useGameStore.getState().state !== 'flying' || document.hidden) return
      useClockStore.getState().tick(Math.min(deltaMs / 1000, MAX_CLOCK_STEP_S))
    }, FRAME_PRIORITY.clock)

    const unsubscribe = useGameStore.subscribe((game, previous) => {
      if (previous.state === 'flying' && game.state !== 'flying') useClockStore.getState().save()
    })

    return () => {
      remove()
      unsubscribe()
      useClockStore.getState().save()
    }
  }, [])
}
