import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAUSE_MENU_PARAMS,
  INITIAL_PAUSE_MENU,
  movePauseMenu,
  pauseMenuHoldProgress,
  stepPauseMenu,
  type PauseMenuState,
} from './pauseMenu'

const COUNT = 3
const FRAME_MS = 16

/** Steps at ~60 fps from `fromMs` to `toMs` with a fixed pose, collecting selections. */
function run(
  state: PauseMenuState,
  active: boolean,
  roll: number,
  fromMs: number,
  toMs: number,
): { state: PauseMenuState; selected: number[] } {
  const selected: number[] = []
  let current = state
  for (let t = fromMs; t <= toMs; t += FRAME_MS) {
    const result = stepPauseMenu(current, { active, roll, nowMs: t }, COUNT)
    current = result.state
    if (result.selected !== null) selected.push(result.selected)
  }
  return { state: current, selected }
}

describe('stepPauseMenu', () => {
  it('starts on the first item', () => {
    expect(INITIAL_PAUSE_MENU.index).toBe(0)
  })

  it('returns the same state object while arms are down', () => {
    const result = stepPauseMenu(INITIAL_PAUSE_MENU, { active: false, roll: 0, nowMs: 100 }, COUNT)
    expect(result.state).toBe(INITIAL_PAUSE_MENU)
    expect(result.selected).toBeNull()
  })

  it('moves one item per tilt, and needs a return to level before moving again', () => {
    let result = run(INITIAL_PAUSE_MENU, true, 0.8, 0, 1000)
    expect(result.state.index).toBe(1)
    expect(result.selected).toEqual([])

    // Easing off, but not to level, does not re-arm.
    result = run(result.state, true, 0.3, 1016, 1100)
    result = run(result.state, true, 0.8, 1116, 1200)
    expect(result.state.index).toBe(1)

    // Back to level, then tilt again.
    result = run(result.state, true, 0, 1216, 1300)
    result = run(result.state, true, 0.8, 1316, 1400)
    expect(result.state.index).toBe(2)
  })

  it('tilting left moves back, and the highlight stops at the ends', () => {
    let result = run(INITIAL_PAUSE_MENU, true, -0.9, 0, 100)
    expect(result.state.index).toBe(0)

    let state: PauseMenuState = { index: 2, tilt: 0, holdStartMs: null }
    result = run(state, true, 0.9, 0, 100)
    expect(result.state.index).toBe(2)

    state = { index: 2, tilt: 0, holdStartMs: null }
    result = run(state, true, -0.9, 0, 100)
    expect(result.state.index).toBe(1)
  })

  it('a tilt straight from one side to the other moves each way', () => {
    let result = run(INITIAL_PAUSE_MENU, true, 0.9, 0, 100)
    expect(result.state.index).toBe(1)
    result = run(result.state, true, -0.9, 116, 200)
    expect(result.state.index).toBe(0)
  })

  it('selects the highlighted item after a 1.5 s level hold', () => {
    const start: PauseMenuState = { index: 1, tilt: 0, holdStartMs: null }
    let result = run(start, true, 0.05, 0, 1400)
    expect(result.selected).toEqual([])
    expect(pauseMenuHoldProgress(result.state, 750)).toBeCloseTo(0.5)

    result = run(result.state, true, 0.05, 1416, 1540)
    expect(result.selected).toEqual([1])
    expect(result.state.holdStartMs).not.toBeNull() // the next hold has started
  })

  it('restarts the hold when the arms drop or the player leans', () => {
    let result = run(INITIAL_PAUSE_MENU, true, 0, 0, 1000)
    result = run(result.state, false, 0, 1016, 1016)
    expect(result.state.holdStartMs).toBeNull()
    result = run(result.state, true, 0, 1032, 2000)
    expect(result.selected).toEqual([])

    result = run(result.state, true, 0.3, 2016, 2016)
    expect(result.state.holdStartMs).toBeNull()
    expect(pauseMenuHoldProgress(result.state, 2100)).toBe(0)
  })

  it('a tilt cancels a running hold', () => {
    let result = run(INITIAL_PAUSE_MENU, true, 0, 0, 1000)
    result = run(result.state, true, 0.9, 1016, 1016)
    expect(result.state).toEqual({ index: 1, tilt: 1, holdStartMs: null })
  })
})

describe('movePauseMenu', () => {
  it('moves by the delta, clamped, and cancels any hold', () => {
    const holding: PauseMenuState = { index: 0, tilt: 0, holdStartMs: 10 }
    expect(movePauseMenu(holding, 1, COUNT)).toEqual({ index: 1, tilt: 0, holdStartMs: null })
    expect(movePauseMenu(holding, -1, COUNT)).toEqual({ index: 0, tilt: 0, holdStartMs: null })
    expect(movePauseMenu(INITIAL_PAUSE_MENU, 5, COUNT).index).toBe(2)
  })

  it('returns the same object when nothing changes', () => {
    expect(movePauseMenu(INITIAL_PAUSE_MENU, -1, COUNT)).toBe(INITIAL_PAUSE_MENU)
  })
})

describe('pauseMenuHoldProgress', () => {
  it('is 0 when not holding and clamps to 1', () => {
    expect(pauseMenuHoldProgress(INITIAL_PAUSE_MENU, 5000)).toBe(0)
    const holding: PauseMenuState = { index: 0, tilt: 0, holdStartMs: 0 }
    expect(pauseMenuHoldProgress(holding, DEFAULT_PAUSE_MENU_PARAMS.holdMs * 2)).toBe(1)
  })
})
