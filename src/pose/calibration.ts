/**
 * Per-player neutral pose, captured by the calibration flow (#17). `shoulderWidth` is a fallback
 * normalizer for frames where the live shoulder distance can't be measured (missing landmarks);
 * day-to-day roll/pitch normalization uses the live shoulder width so the gesture stays consistent
 * as the player's distance from the camera changes.
 */
export interface Calibration {
  neutralRollDeg: number
  neutralPitch: number
  shoulderWidth: number
}

/** Assumes a level T-pose is neutral. Used until the player completes calibration once. */
export const DEFAULT_CALIBRATION: Calibration = {
  neutralRollDeg: 0,
  neutralPitch: 0,
  shoulderWidth: 0.2,
}

const STORAGE_KEY = 'skyborne.calibration.v1'

/** Validates stored JSON. Returns null for anything that isn't a finite, positive-width calibration. */
export function parseCalibration(raw: string | null): Calibration | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { neutralRollDeg, neutralPitch, shoulderWidth } = value as Record<string, unknown>
    if (
      typeof neutralRollDeg !== 'number' ||
      typeof neutralPitch !== 'number' ||
      typeof shoulderWidth !== 'number' ||
      !Number.isFinite(neutralRollDeg) ||
      !Number.isFinite(neutralPitch) ||
      !Number.isFinite(shoulderWidth) ||
      shoulderWidth <= 0
    ) {
      return null
    }
    return { neutralRollDeg, neutralPitch, shoulderWidth }
  } catch {
    return null
  }
}

/** Reads the saved calibration. Storage can throw (private mode, blocked site data). */
export function loadCalibration(storage: Pick<Storage, 'getItem'> | undefined): Calibration | null {
  try {
    return parseCalibration(storage?.getItem(STORAGE_KEY) ?? null)
  } catch {
    return null
  }
}

export function saveCalibration(
  storage: Pick<Storage, 'setItem'> | undefined,
  calibration: Calibration,
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(calibration))
  } catch {
    // Quota or privacy mode: calibration still applies for this session via the store.
  }
}
