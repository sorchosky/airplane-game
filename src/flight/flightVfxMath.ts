import { clamp } from '../input/clamp'

export const FLIGHT_VFX = {
  streakCount: 24,
  streakStartSpeedRatio: 1.08,
  streakFullSpeedRatio: 1.35,
  lowPassHeight: 8,
  contactLife: 0.8,
  shakeStartSpeedRatio: 1.08,
  shakeMaxMetres: 0.075,
} as const

/** 0..1 intensity shared by speed lines and camera shake. */
export function speedVfxIntensity(speed: number, cruiseSpeed: number): number {
  const ratio = speed / Math.max(cruiseSpeed, 1e-6)
  return clamp(
    (ratio - FLIGHT_VFX.streakStartSpeedRatio) /
      (FLIGHT_VFX.streakFullSpeedRatio - FLIGHT_VFX.streakStartSpeedRatio),
    0,
    1,
  )
}

/** Small deterministic two-axis camera vibration; deterministic makes screenshots and replays stable. */
export function cameraShake(timeSeconds: number, intensity: number): readonly [number, number] {
  const amount = FLIGHT_VFX.shakeMaxMetres * clamp(intensity, 0, 1)
  if (amount === 0) return [0, 0]
  return [
    amount * (Math.sin(timeSeconds * 31) * 0.65 + Math.sin(timeSeconds * 47) * 0.35),
    amount * (Math.sin(timeSeconds * 37 + 1.7) * 0.7 + Math.sin(timeSeconds * 53) * 0.3),
  ]
}

export function lowPassIntensity(altitude: number): number {
  return clamp(1 - altitude / FLIGHT_VFX.lowPassHeight, 0, 1)
}
