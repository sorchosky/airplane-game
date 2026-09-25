export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampAxis(value: number): number {
  return clamp(value, -1, 1)
}

export function clampConfidence(value: number): number {
  return clamp(value, 0, 1)
}
