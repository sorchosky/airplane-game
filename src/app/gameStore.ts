import { create } from 'zustand'

export type GameState = 'title' | 'permission' | 'calibrate' | 'flying' | 'paused' | 'error'

export interface GameStore {
  state: GameState
  errorMessage: string | null
  /** Requests camera permission, then advances to calibrate (or straight to flying in keyboard dev mode). */
  startPermission: () => void
  permissionGranted: () => void
  permissionDenied: (message: string) => void
  calibrationComplete: () => void
  pause: () => void
  resume: () => void
  /** Pause menu: back through the calibration flow, which returns to flying when done. */
  recalibrate: () => void
  quitToTitle: () => void
  retry: () => void
  /** Dev-only: `?input=keyboard` skips the permission probe entirely. */
  skipToFlying: () => void
}

// Allowed transitions, keyed by the state they leave from. Anything not
// listed here is a no-op (and logged in dev) rather than a thrown error,
// since a stray event mid-transition shouldn't crash the game.
const TRANSITIONS: Record<GameState, Partial<Record<keyof GameStore, GameState>>> = {
  title: { startPermission: 'permission', skipToFlying: 'flying' },
  permission: { permissionGranted: 'calibrate', permissionDenied: 'error' },
  calibrate: { calibrationComplete: 'flying', quitToTitle: 'title', permissionDenied: 'error' },
  flying: { pause: 'paused', quitToTitle: 'title' },
  paused: { resume: 'flying', recalibrate: 'calibrate', quitToTitle: 'title' },
  error: { retry: 'title' },
}

function transition(action: keyof GameStore, from: GameState): GameState | null {
  const to = TRANSITIONS[from][action]
  if (!to) {
    if (import.meta.env.DEV) {
      console.warn(`[gameStore] ignored "${action}" from state "${from}"`)
    }
    return null
  }
  return to
}

export const useGameStore = create<GameStore>((set, get) => {
  const applyAction = (action: keyof GameStore) => {
    const next = transition(action, get().state)
    if (next) set({ state: next, errorMessage: null })
  }

  return {
    state: 'title',
    errorMessage: null,
    startPermission: () => applyAction('startPermission'),
    permissionGranted: () => applyAction('permissionGranted'),
    permissionDenied: (message: string) => {
      const next = transition('permissionDenied', get().state)
      if (next) set({ state: next, errorMessage: message })
    },
    calibrationComplete: () => applyAction('calibrationComplete'),
    pause: () => applyAction('pause'),
    resume: () => applyAction('resume'),
    recalibrate: () => applyAction('recalibrate'),
    quitToTitle: () => applyAction('quitToTitle'),
    retry: () => applyAction('retry'),
    skipToFlying: () => applyAction('skipToFlying'),
  }
})
