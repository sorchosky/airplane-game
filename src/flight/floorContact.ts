import { FLIGHT_FEEL } from './flightModel'

/**
 * Turns the flight state's continuous `floorContact` depth (0..1) into start and end events for
 * the low-pass payoff (#68): spray, dust and a thump in F2, a wind swell in F3. Pure.
 */

export type FloorContactEvent =
  | { type: 'start'; strength: number }
  /** `peak` is the deepest the plane got into the band during the contact. */
  | { type: 'end'; peak: number }

export interface FloorContactTracker {
  inContact: boolean
  peak: number
}

export function createFloorContactTracker(): FloorContactTracker {
  return { inContact: false, peak: 0 }
}

export interface FloorContactThresholds {
  enter: number
  exit: number
}

export const DEFAULT_FLOOR_CONTACT_THRESHOLDS: FloorContactThresholds = {
  enter: FLIGHT_FEEL.floorContactEnter,
  exit: FLIGHT_FEEL.floorContactExit,
}

/**
 * Feeds one frame's depth. Updates `tracker` in place and returns an event on the frame a contact
 * starts or ends, otherwise null (no allocation on ordinary frames).
 */
export function trackFloorContact(
  tracker: FloorContactTracker,
  depth: number,
  thresholds: FloorContactThresholds = DEFAULT_FLOOR_CONTACT_THRESHOLDS,
): FloorContactEvent | null {
  if (!tracker.inContact) {
    if (depth < thresholds.enter) return null
    tracker.inContact = true
    tracker.peak = depth
    return { type: 'start', strength: depth }
  }
  if (depth > tracker.peak) tracker.peak = depth
  if (depth > thresholds.exit) return null
  tracker.inContact = false
  const peak = tracker.peak
  tracker.peak = 0
  return { type: 'end', peak }
}
