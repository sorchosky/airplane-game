import { create } from 'zustand'

/** `booting`: the poster covers it. `ready`: the first terrain is drawn. `failed`: no world; the poster stays. */
export type WorldStatus = 'booting' | 'ready' | 'failed'

interface WorldStore {
  status: WorldStatus
  /** The poster sky's current frame as an image URL, for the Start hand-off. Null once it's gone. */
  posterSnapshot: (() => string | null) | null
  markReady: () => void
  markFailed: () => void
  setPosterSnapshot: (snapshot: (() => string | null) | null) => void
}

/**
 * Boot state of the persistent world canvas (#153). Written by the scene, read by `WorldLayer` to
 * decide when the poster fades. A later success clears an earlier failure (a lost context that
 * the remounted canvas recovers from); a failure never undoes a ready world.
 */
export const useWorldStore = create<WorldStore>((set, get) => ({
  status: 'booting',
  posterSnapshot: null,
  markReady: () => set({ status: 'ready' }),
  markFailed: () => {
    if (get().status === 'booting') set({ status: 'failed' })
  },
  setPosterSnapshot: (posterSnapshot) => set({ posterSnapshot }),
}))
