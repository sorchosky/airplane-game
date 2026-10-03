import { useControlStore } from '../app/controlStore'
import { useGameStore } from '../app/gameStore'
import { useFlightStore } from '../flight/flightStore'
import { useInputStore } from '../input/inputStore'
import { replayStatus, type ReplayPhase } from '../input/replaySource'
import { getInputSourceFromUrl, hasDebugFlag } from '../input/source'
import { useCalibrationStore } from '../pose/calibrationStore'
import { surfaceHeightAt } from '../world/heightfield'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { shotFlightState } from './shots'

/** One read of the game's live state, as plain numbers and strings. */
export interface DriftwingSnapshot {
  game: string
  controlPhase: string
  calibrated: boolean
  input: { roll: number; pitch: number; active: boolean; boost: boolean; source: string }
  flight: {
    bankDeg: number
    pitchDeg: number
    altitude: number
    /** World m, the plane's ground position (`altitude` is its y). */
    x: number
    z: number
    speed: number
    heading: number
    boosting: boolean
  }
  replay: { phase: ReplayPhase; label: string | null; frameIndex: number; elapsedMs: number }
}

export interface DriftwingTestHook {
  snapshot: () => DriftwingSnapshot
  /**
   * Moves the plane to world (`x`, `z`), `height` m over the ground, wings level on `heading`
   * (radians, 0 flies toward -Z), at cruise speed. For specs that need a far place without
   * minutes of flying to it, such as the wrap seam (#177).
   */
  place: (x: number, z: number, heading: number, height?: number) => void
}

declare global {
  interface Window {
    /** Probe for e2e specs; present only under `?debug` or `?input=replay`. */
    __driftwing?: DriftwingTestHook
  }
}

const DEG = 180 / Math.PI

function snapshot(): DriftwingSnapshot {
  const input = useInputStore.getState().current
  const { state } = useFlightStore.getState()
  return {
    game: useGameStore.getState().state,
    controlPhase: useControlStore.getState().machine.phase,
    calibrated: useCalibrationStore.getState().calibration !== null,
    input: {
      roll: input.roll,
      pitch: input.pitch,
      active: input.active,
      boost: input.boost === true,
      source: input.source,
    },
    flight: {
      bankDeg: state.bank * DEG,
      pitchDeg: state.pitchAngle * DEG,
      altitude: state.position.y,
      x: state.position.x,
      z: state.position.z,
      speed: state.speed,
      heading: state.heading,
      boosting: state.boosting,
    },
    replay: {
      phase: replayStatus.phase,
      label: replayStatus.label,
      frameIndex: replayStatus.frameIndex,
      elapsedMs: replayStatus.elapsedMs,
    },
  }
}

function place(x: number, z: number, heading: number, height = 150): void {
  const y = surfaceHeightAt(x, z, TERRAIN_CONFIG) + height
  const { params } = useFlightStore.getState()
  const state = shotFlightState(
    { name: 'place', position: [x, y, z], heading, bank: 0, pitchAngle: 0, purpose: 'test hook' },
    params.cruiseSpeed,
  )
  useFlightStore.setState({ state, levellingOff: false })
}

/**
 * Exposes `window.__driftwing` for Playwright under `?debug` or `?input=replay`, so specs can
 * assert on the sim instead of on pixels. Never installed for players.
 */
export function installTestHook(search: string = window.location.search): void {
  if (!hasDebugFlag(search) && getInputSourceFromUrl(search) !== 'replay') return
  window.__driftwing = { snapshot, place }
}
