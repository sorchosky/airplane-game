import { useEffect } from 'react'
import { create } from 'zustand'
import { useInputStore } from '../input/inputStore'
import { usePoseStore } from '../pose/poseStore'
import {
  DEFAULT_CONTROL_MACHINE_PARAMS,
  controlView,
  createControlMachineState,
  forcePause,
  startCountdown,
  stepControlMachine,
  togglePause,
  type ControlMachineParams,
  type ControlMachineState,
  type ControlStepResult,
  type ControlView,
} from './controlStateMachine'
import { FRAME_PRIORITY, frameLoop } from './frameLoop'
import { useGameStore } from './gameStore'
import { getInputSourceFromUrl } from '../input/source'

const INITIAL_VIEW: ControlView = { prompt: null, paused: false, countdown: null }

interface ControlStore {
  machine: ControlMachineState
  /**
   * What the HUD shows. Replaced only when a field changes, so components can subscribe to a
   * single field (`useControlStore((s) => s.view.prompt)`) without re-rendering every frame.
   */
  view: ControlView
  /** Esc in keyboard mode. */
  togglePause: () => void
  /** Resume picked in the pause menu: starts the 3-2-1 countdown. */
  startCountdown: () => void
  /** Pauses from outside the player's control (the phone turned to portrait). */
  forcePause: () => void
}

export const useControlStore = create<ControlStore>((_set, get) => ({
  machine: createControlMachineState(0),
  view: INITIAL_VIEW,
  togglePause: () => {
    const nowMs = performance.now()
    apply(togglePause(get().machine, nowMs), nowMs)
  },
  startCountdown: () => {
    const nowMs = performance.now()
    apply(startCountdown(get().machine, nowMs), nowMs)
  },
  forcePause: () => {
    const nowMs = performance.now()
    apply(forcePause(get().machine, nowMs), nowMs)
  },
}))

function paramsForMode(): ControlMachineParams {
  return { ...DEFAULT_CONTROL_MACHINE_PARAMS, gesturePause: getInputSourceFromUrl() !== 'keyboard' }
}

function sameView(a: ControlView, b: ControlView): boolean {
  return a.prompt === b.prompt && a.paused === b.paused && a.countdown === b.countdown
}

/** Keyboard input has no body to lose track of; pose/replay read the latest detection. */
function personInFrame(): boolean {
  if (useInputStore.getState().current.source === 'keyboard') return true
  return usePoseStore.getState().frame !== null
}

function apply({ state, command }: ControlStepResult, nowMs: number): void {
  const store = useControlStore.getState()
  const view = controlView(state, nowMs, personInFrame(), paramsForMode())
  if (state !== store.machine || !sameView(view, store.view)) {
    useControlStore.setState({
      machine: state,
      view: sameView(view, store.view) ? store.view : view,
    })
  }

  const game = useGameStore.getState()
  if (command === 'pause') game.pause()
  if (command === 'resume') game.resume()
}

/**
 * Runs the control-state machine every animation frame while the flight scene is up
 * (`flying` or `paused`), and binds Esc to pause in keyboard mode. Mount once near the app root,
 * only during those states, so each flight starts from a fresh machine.
 */
export function useControlStateDriver(): void {
  useEffect(() => {
    const params = paramsForMode()
    useControlStore.setState({
      machine: createControlMachineState(performance.now()),
      view: INITIAL_VIEW,
    })

    // After the input sources (same frame loop, lower priority runs first), so the machine
    // sees this frame's input rather than last frame's.
    const remove = frameLoop.add((nowMs) => {
      const { active } = useInputStore.getState().current
      apply(
        stepControlMachine(useControlStore.getState().machine, { active, nowMs }, params),
        nowMs,
      )
    }, FRAME_PRIORITY.control)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.repeat) useControlStore.getState().togglePause()
    }
    if (!params.gesturePause) window.addEventListener('keydown', onKeyDown)

    return () => {
      remove()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
