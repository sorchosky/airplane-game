import { create } from 'zustand'
import { loadCalibration, saveCalibration, type Calibration } from './calibration'

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

interface CalibrationStore {
  /** The player's calibration, from this session or a previous one. Null until calibrated once. */
  calibration: Calibration | null
  /** Applies a calibration and persists it for the next session. */
  setCalibration: (calibration: Calibration) => void
}

/** Read with `getState()` by `poseSource`; written once when the calibrate screen completes. */
export const useCalibrationStore = create<CalibrationStore>((set) => ({
  calibration: loadCalibration(storage()),
  setCalibration: (calibration) => {
    saveCalibration(storage(), calibration)
    set({ calibration })
  },
}))
