/** Rolling one-second sample of roll speed. Fixed storage keeps the HUD allocation-free. */
export interface RollStability {
  rates: Float64Array
  index: number
  count: number
  lastRoll: number
  lastMs: number
  steadySinceMs: number
}

export function createRollStability(): RollStability {
  return {
    rates: new Float64Array(10),
    index: 0,
    count: 0,
    lastRoll: 0,
    lastMs: 0,
    steadySinceMs: 0,
  }
}

export function updateRollStability(
  state: RollStability,
  roll: number,
  active: boolean,
  nowMs: number,
): boolean {
  if (!active) {
    state.count = 0
    state.lastMs = nowMs
    state.lastRoll = roll
    state.steadySinceMs = nowMs
    return true
  }
  if (nowMs - state.lastMs >= 100) {
    const rate = (roll - state.lastRoll) / Math.max(0.001, (nowMs - state.lastMs) / 1000)
    state.rates[state.index] = rate
    state.index = (state.index + 1) % state.rates.length
    state.count = Math.min(state.count + 1, state.rates.length)
    state.lastRoll = roll
    state.lastMs = nowMs
  }
  if (state.count < state.rates.length) return true
  let sum = 0
  let squares = 0
  for (let i = 0; i < state.count; i += 1) {
    const rate = state.rates[i] ?? 0
    sum += rate
    squares += rate * rate
  }
  const variance = squares / state.count - (sum / state.count) ** 2
  if (variance > 0.2) state.steadySinceMs = nowMs
  return nowMs - state.steadySinceMs < 20_000
}
