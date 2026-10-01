import { create } from 'zustand'

/** `booting`: the poster covers it. `ready`: the first terrain is drawn. `failed`: no world; the poster stays. */
export type WorldStatus = 'booting' | 'ready' | 'failed'

interface WorldStore {
  status: WorldStatus
  markReady: () => void
  markFailed: () => void
}

/**
 * Boot state of the persistent world canvas (#153). Written by the scene, read by `WorldLayer` to
 * decide when the poster fades. A later success clears an earlier failure (a lost context that
 * the remounted canvas recovers from); a failure never undoes a ready world.
 */
export const useWorldStore = create<WorldStore>((set, get) => ({
  status: 'booting',
  markReady: () => set({ status: 'ready' }),
  markFailed: () => {
    if (get().status === 'booting') set({ status: 'failed' })
  },
}))
