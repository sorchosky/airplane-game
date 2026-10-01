import { wrapMinutes } from '../world/gameClock'
import { moonDirectionAt, sunDirectionAt } from '../world/starVisibility'

export interface DialGlyphPosition {
  /** Across the horizon, 0 at rise and 1 at set. */
  x: number
  /** Height above the horizon, 0 at either end and 1 at culmination. */
  y: number
  opacity: number
}

export interface SunMoonDialPosition {
  sun: DialGlyphPosition
  moon: DialGlyphPosition
}

const TRANSITION_MINUTES = 30
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const smoothstep = (value: number) => {
  const x = clamp01(value)
  return x * x * (3 - 2 * x)
}

function glyphPosition(
  direction: readonly [number, number, number],
): Omit<DialGlyphPosition, 'opacity'> {
  // Both celestial helpers travel east to west through the same vertical plane. Projecting that
  // direction onto the dial means its endpoints and apex cannot drift away from the sky model.
  return {
    x: clamp01((direction[0] + 1) / 2),
    y: clamp01(direction[1]),
  }
}

/** Pure dial projection. Sunrise/sunset are 06:00/18:00, and moonrise/moonset are 18:00/06:00. */
export function sunMoonDialPosition(minutes: number): SunMoonDialPosition {
  const minute = wrapMinutes(minutes)
  const sunDirection = sunDirectionAt(minute)
  const moonDirection = moonDirectionAt(minute)
  const sun = glyphPosition(sunDirection)
  const moon = glyphPosition(moonDirection)

  // The half-hour transition straddles the horizon. The direction is clamped to the arc while
  // opacity changes, so neither the arriving nor departing mark leaks outside the dial.
  const sunOpacity =
    smoothstep((minute - (360 - TRANSITION_MINUTES)) / (TRANSITION_MINUTES * 2)) *
    (1 - smoothstep((minute - (1080 - TRANSITION_MINUTES)) / (TRANSITION_MINUTES * 2)))
  const moonOpacity =
    minute < 720
      ? 1 - smoothstep((minute - (360 - TRANSITION_MINUTES)) / (TRANSITION_MINUTES * 2))
      : smoothstep((minute - (1080 - TRANSITION_MINUTES)) / (TRANSITION_MINUTES * 2))

  return {
    sun: { ...sun, opacity: sunOpacity },
    moon: { ...moon, opacity: moonOpacity },
  }
}
