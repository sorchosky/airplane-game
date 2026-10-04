import { create } from 'zustand'
import { initialProgress, type LoopProgress } from './goldenPath'

interface GoldenPathState {
  /** The current lap. Changes only when a gate is passed, never per frame. */
  progress: LoopProgress
  /** `performance.now()` of the last completed lap, for the title. 0 before the first. */
  reveal: number
  /** Drawn wind rings, exposed for the e2e test hook. */
  visibleRingCount: number
}

/** The golden path's lap progress and lap counter (`progress.laps`). */
export const useGoldenPathStore = create<GoldenPathState>(() => ({
  progress: initialProgress(0),
  reveal: 0,
  visibleRingCount: 0,
}))
