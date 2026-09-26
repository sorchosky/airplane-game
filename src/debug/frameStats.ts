/**
 * Rolling frame-time statistics for the perf HUD. Pure, allocation-free after construction: a
 * fixed ring of frame times, summarised on demand into a caller-supplied object.
 */
export interface FrameStats {
  /** Frame times, ms, oldest overwritten first. */
  readonly ring: Float32Array
  /** Scratch copy for sorting; percentiles never sort the ring itself. */
  readonly scratch: Float32Array
  /** Next write index. */
  head: number
  /** Frames recorded so far, capped at the ring length. */
  count: number
}

export interface FrameSummary {
  /** Mean fps over the whole window. */
  fps: number
  /** Mean frame time, ms. */
  meanMs: number
  /** 95th and 99th percentile frame time, ms. */
  p95Ms: number
  p99Ms: number
  /** Mean of the slowest 1 % of frames expressed as fps (the "1 % low" of benchmark reviews). */
  onePercentLowFps: number
}

/** Five seconds at 60 fps. Long enough for p99 to mean something, short enough to react. */
export const DEFAULT_FRAME_WINDOW = 300

export function createFrameStats(window = DEFAULT_FRAME_WINDOW): FrameStats {
  return { ring: new Float32Array(window), scratch: new Float32Array(window), head: 0, count: 0 }
}

export function pushFrame(stats: FrameStats, frameMs: number): void {
  stats.ring[stats.head] = frameMs
  stats.head = (stats.head + 1) % stats.ring.length
  if (stats.count < stats.ring.length) stats.count += 1
}

export function resetFrameStats(stats: FrameStats): void {
  stats.head = 0
  stats.count = 0
}

/** Value at `fraction` (0..1) of a sorted, filled prefix of `sorted`, nearest-rank. */
export function percentile(sorted: Float32Array, count: number, fraction: number): number {
  if (count <= 0) return 0
  const rank = Math.min(count - 1, Math.max(0, Math.ceil(fraction * count) - 1))
  return sorted[rank] ?? 0
}

/** Fills `out` from the current window. Sorts a scratch copy, so the ring keeps its order. */
export function summarizeFrames(stats: FrameStats, out: FrameSummary): FrameSummary {
  const { ring, scratch, count } = stats
  if (count === 0) {
    out.fps = 0
    out.meanMs = 0
    out.p95Ms = 0
    out.p99Ms = 0
    out.onePercentLowFps = 0
    return out
  }
  let sum = 0
  for (let i = 0; i < count; i++) {
    const v = ring[i] ?? 0
    scratch[i] = v
    sum += v
  }
  const filled = scratch.subarray(0, count)
  filled.sort()
  out.meanMs = sum / count
  out.fps = out.meanMs > 0 ? 1000 / out.meanMs : 0
  out.p95Ms = percentile(filled, count, 0.95)
  out.p99Ms = percentile(filled, count, 0.99)
  const slowest = Math.max(1, Math.ceil(count * 0.01))
  let slowSum = 0
  for (let i = count - slowest; i < count; i++) slowSum += filled[i] ?? 0
  const slowMean = slowSum / slowest
  out.onePercentLowFps = slowMean > 0 ? 1000 / slowMean : 0
  return out
}
