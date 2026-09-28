import { create } from 'zustand'

export type GameState =
  'title' | 'select' | 'permission' | 'calibrate' | 'wings' | 'flying' | 'paused' | 'error'

const WINGS_DONE_KEY = 'driftwing:wings-complete'

function shouldPractice(reusedCalibration: boolean): boolean {
  if (typeof window === 'undefined') return true
  const override = new URLSearchParams(window.location.search).get('wings')
  if (override === 'always') return true
  if (override === 'off') return false
  try {
    return !(reusedCalibration && window.localStorage.getItem(WINGS_DONE_KEY) === 'true')
  } catch {
    return true
  }
}

export interface GameStore {
  state: GameState
  errorMessage: string | null
  startSelection: () => void
  /** Requests camera permission, then advances to calibrate (or straight to flying in keyboard dev mode). */
  startPermission: () => void
  permissionGranted: () => void
  permissionDenied: (message: string) => void
  calibrationComplete: (reusedCalibration?: boolean) => void
  wingsComplete: () => void
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
  title: { startSelection: 'select', startPermission: 'permission', skipToFlying: 'flying' },
  select: { startPermission: 'permission', skipToFlying: 'flying', quitToTitle: 'title' },
  permission: { permissionGranted: 'calibrate', permissionDenied: 'error' },
  calibrate: { calibrationComplete: 'wings', quitToTitle: 'title', permissionDenied: 'error' },
  wings: { wingsComplete: 'flying', quitToTitle: 'title' },
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
    startSelection: () => applyAction('startSelection'),
    startPermission: () => applyAction('startPermission'),
    permissionGranted: () => applyAction('permissionGranted'),
    permissionDenied: (message: string) => {
      const next = transition('permissionDenied', get().state)
      if (next) set({ state: next, errorMessage: message })
    },
    calibrationComplete: (reusedCalibration = false) => {
      const next = transition('calibrationComplete', get().state)
      if (next)
        set({ state: shouldPractice(reusedCalibration) ? 'wings' : 'flying', errorMessage: null })
    },
    wingsComplete: () => {
      if (get().state !== 'wings') return
      try {
        window.localStorage.setItem(WINGS_DONE_KEY, 'true')
      } catch {
        // Private browsing can reject storage; the current flight still continues.
      }
      applyAction('wingsComplete')
    },
    pause: () => applyAction('pause'),
    resume: () => applyAction('resume'),
    recalibrate: () => applyAction('recalibrate'),
    quitToTitle: () => applyAction('quitToTitle'),
    retry: () => applyAction('retry'),
    skipToFlying: () => applyAction('skipToFlying'),
  }
})
