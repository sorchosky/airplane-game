/**
 * The plane keeps its near-black ink through dawn and dusk. Only deep night gets a small neutral
 * lift, compressed into the upper end of `nightAmount` so the cycle does not linger on a muddy
 * mid-grey outline. Smoothstep keeps the colour and its slope continuous at both thresholds.
 */
export const PLANE_OUTLINE_LIFT = {
  start: 0.4,
  full: 0.85,
} as const

export function planeOutlineNightMix(nightAmount: number): number {
  const x = Math.max(
    0,
    Math.min(
      1,
      (nightAmount - PLANE_OUTLINE_LIFT.start) /
        (PLANE_OUTLINE_LIFT.full - PLANE_OUTLINE_LIFT.start),
    ),
  )
  return x * x * (3 - 2 * x)
}
