import type { ControlMode } from './controlModeStore'
import type { GameState } from './gameStore'

/**
 * The front door's beats (#151): `poster` is the boot frame before the world is ready (the stage
 * derives it from world status in the beat tickets, so `beatFor` never returns it), `masthead` the
 * title, `choose` the control choice, `position` the stand-in-frame calibration, and `flight` once
 * the stage is gone.
 */
export type Beat = 'poster' | 'masthead' | 'choose' | 'position' | 'flight'

/**
 * Maps the game state to a beat. `permission` is transient and leads to calibrate only for camera
 * control, so it reads as `position` there and stays on the title otherwise. `error` keeps the
 * masthead (the stage hosts the error frame in place), and quitting back to `title` from any
 * flight state lands on the masthead again.
 */
export function beatFor(state: GameState, controlMode: ControlMode): Beat {
  switch (state) {
    case 'title':
    case 'error':
      return 'masthead'
    case 'select':
      return 'choose'
    case 'permission':
      return controlMode === 'camera' ? 'position' : 'masthead'
    case 'calibrate':
      return 'position'
    case 'wings':
    case 'flying':
    case 'paused':
      return 'flight'
  }
}
