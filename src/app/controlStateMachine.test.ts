import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONTROL_MACHINE_PARAMS,
  controlView,
  createControlMachineState,
  forcePause,
  startCountdown,
  stepControlMachine,
  togglePause,
  type ControlCommand,
  type ControlMachineParams,
  type ControlMachineState,
} from './controlStateMachine'

const FRAME_MS = 16

/** Steps the machine at ~60 fps from `fromMs` to `toMs`, collecting any commands emitted. */
function run(
  state: ControlMachineState,
  active: boolean,
  fromMs: number,
  toMs: number,
  params: ControlMachineParams = DEFAULT_CONTROL_MACHINE_PARAMS,
): { state: ControlMachineState; commands: ControlCommand[] } {
  const commands: ControlCommand[] = []
  let current = state
  for (let t = fromMs; t <= toMs; t += FRAME_MS) {
    const result = stepControlMachine(current, { active, nowMs: t }, params)
    current = result.state
    if (result.command) commands.push(result.command)
  }
  return { state: current, commands }
}

describe('stepControlMachine', () => {
  it('goes active as soon as the input is active, and inactive as soon as it drops', () => {
    let state = createControlMachineState(0)
    state = stepControlMachine(state, { active: true, nowMs: 10 }).state
    expect(state.phase).toBe('active')
    state = stepControlMachine(state, { active: false, nowMs: 20 }).state
    expect(state).toEqual({ phase: 'inactive', sinceMs: 20 })
  })

  it('returns the same state object when nothing changes', () => {
    const state = { phase: 'active' as const, sinceMs: 0 }
    expect(stepControlMachine(state, { active: true, nowMs: 5000 }).state).toBe(state)
  })

  it('walks idle → prompt → pause → countdown → resume', () => {
    // Idle: arms drop at t=0.
    let state: ControlMachineState = { phase: 'inactive', sinceMs: 0 }
    expect(controlView(state, 0, true).prompt).toBeNull()

    // Prompt after 300 ms.
    let result = run(state, false, 0, 320)
    expect(result.commands).toEqual([])
    expect(controlView(result.state, 320, true).prompt).toBe('spread-arms')

    // Pause at 5 s.
    result = run(result.state, false, 336, 5008)
    expect(result.commands).toEqual(['pause'])
    state = result.state
    expect(state.phase).toBe('paused')
    expect(controlView(state, 5008, true)).toEqual({ prompt: null, paused: true, countdown: null })

    // Arms out alone doesn't resume: the pause menu owns the hold and starts the countdown.
    result = run(state, true, 6000, 9000)
    expect(result.state.phase).toBe('paused')
    result = { state: startCountdown(result.state, 9000).state, commands: [] }
    expect(result.state.phase).toBe('countdown')
    const countdownStart = result.state.sinceMs
    expect(controlView(result.state, countdownStart, true).countdown).toBe(3)
    expect(controlView(result.state, countdownStart + 1000, true).countdown).toBe(2)
    expect(controlView(result.state, countdownStart + 2999, true).countdown).toBe(1)

    // Resume after 3 s.
    result = run(result.state, true, countdownStart + 16, countdownStart + 3008)
    expect(result.commands).toEqual(['resume'])
    expect(result.state.phase).toBe('active')
    expect(controlView(result.state, countdownStart + 3008, true)).toEqual({
      prompt: null,
      paused: false,
      countdown: null,
    })
  })

  it('does not pause if the arms come back before 5 s', () => {
    let result = run({ phase: 'inactive', sinceMs: 0 }, false, 0, 4900)
    result = run(result.state, true, 4916, 4916)
    expect(result.state.phase).toBe('active')
    result = run(result.state, false, 4932, 9000)
    expect(result.commands).toEqual([])
    expect(result.state.phase).toBe('inactive')
  })

  it('cancels the countdown back to paused if the arms drop', () => {
    const state: ControlMachineState = { phase: 'countdown', sinceMs: 0 }
    const result = stepControlMachine(state, { active: false, nowMs: 1500 })
    expect(result.state.phase).toBe('paused')
    expect(result.command).toBeNull()
  })

  describe('with gesturePause off (keyboard)', () => {
    const params = { ...DEFAULT_CONTROL_MACHINE_PARAMS, gesturePause: false }

    it('still shows the prompt but never auto-pauses', () => {
      const result = run({ phase: 'inactive', sinceMs: 0 }, false, 0, 20_000, params)
      expect(result.commands).toEqual([])
      expect(controlView(result.state, 20_000, true, params).prompt).toBe('spread-arms')
    })

    it('ignores arms out while paused', () => {
      const result = run({ phase: 'paused', sinceMs: 0 }, true, 0, 5000, params)
      expect(result.state.phase).toBe('paused')
    })

    it('runs the countdown regardless of the arms, resuming into inactive', () => {
      const result = run({ phase: 'countdown', sinceMs: 0 }, false, 0, 3008, params)
      expect(result.commands).toEqual(['resume'])
      expect(result.state.phase).toBe('inactive')
    })
  })
})

describe('togglePause', () => {
  it('pauses from flying', () => {
    expect(togglePause({ phase: 'active', sinceMs: 0 }, 100)).toEqual({
      state: { phase: 'paused', sinceMs: 100 },
      command: 'pause',
    })
    expect(togglePause({ phase: 'inactive', sinceMs: 0 }, 100).command).toBe('pause')
  })

  it('starts the countdown from paused, and cancels a running countdown', () => {
    const counting = togglePause({ phase: 'paused', sinceMs: 0 }, 100)
    expect(counting).toEqual({ state: { phase: 'countdown', sinceMs: 100 }, command: null })
    expect(togglePause(counting.state, 200).state.phase).toBe('paused')
  })
})

describe('startCountdown', () => {
  it('starts the countdown only from paused', () => {
    expect(startCountdown({ phase: 'paused', sinceMs: 0 }, 100)).toEqual({
      state: { phase: 'countdown', sinceMs: 100 },
      command: null,
    })
    const active: ControlMachineState = { phase: 'active', sinceMs: 0 }
    expect(startCountdown(active, 100).state).toBe(active)
  })
})

describe('forcePause', () => {
  it('pauses from flying and cancels a countdown, but leaves paused alone', () => {
    expect(forcePause({ phase: 'active', sinceMs: 0 }, 100)).toEqual({
      state: { phase: 'paused', sinceMs: 100 },
      command: 'pause',
    })
    expect(forcePause({ phase: 'inactive', sinceMs: 0 }, 100).command).toBe('pause')
    expect(forcePause({ phase: 'countdown', sinceMs: 0 }, 100)).toEqual({
      state: { phase: 'paused', sinceMs: 100 },
      command: null,
    })
    const paused: ControlMachineState = { phase: 'paused', sinceMs: 0 }
    expect(forcePause(paused, 100).state).toBe(paused)
  })
})

describe('controlView', () => {
  it('asks the player to step into view when nobody is detected', () => {
    expect(controlView({ phase: 'inactive', sinceMs: 0 }, 400, false).prompt).toBe('step-into-view')
  })

  it('shows no prompt while steering', () => {
    expect(controlView({ phase: 'active', sinceMs: 0 }, 10_000, false).prompt).toBeNull()
  })
})
