import { clampAxis } from './clamp'

/** Moves `current` toward `target` by at most `rate` units per second, clamped to axis range. */
export function rampTowards(current: number, target: number, rate: number, dt: number): number {
  const maxStep = rate * dt
  const delta = target - current
  if (Math.abs(delta) <= maxStep) {
    return clampAxis(target)
  }
  return clampAxis(current + Math.sign(delta) * maxStep)
}
