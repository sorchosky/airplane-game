const DEG = Math.PI / 180

/**
 * Visibility of one star for a solar elevation in radians. Magnitude is a normalized brightness
 * rank, 0 for the brightest star and 1 for the faintest. Each rank fades across eight degrees,
 * just over 20 in-game minutes around sunrise and sunset on the 24-hour solar clock.
 */
export function starVisibility(sunElevation: number, magnitude: number): number {
  if (sunElevation >= 0) return 0

  const rank = Math.max(0, Math.min(1, magnitude))
  const fadeStart = (-2 - rank * 4) * DEG
  const fadeEnd = fadeStart - 8 * DEG
  const t = Math.max(0, Math.min(1, (fadeStart - sunElevation) / (fadeStart - fadeEnd)))
  return t * t * (3 - 2 * t)
}

/** Solar elevation for the game clock, with 06:00 sunrise and 18:00 sunset. */
export function sunElevationAt(minutes: number): number {
  return Math.sin(((minutes - 360) / 1440) * Math.PI * 2) * (Math.PI / 2)
}

/** Unit celestial direction used by the sky clock, east at sunrise and west at sunset. */
export function sunDirectionAt(minutes: number): [number, number, number] {
  const angle = ((minutes - 360) / 720) * Math.PI
  return [-Math.cos(angle), Math.sin(angle), 0]
}

/** The moon follows the same arc twelve hours after the sun. */
export function moonDirectionAt(minutes: number): [number, number, number] {
  return sunDirectionAt(minutes - 720)
}
