/** Frame cap for the attract world (#153): the title doesn't need 60 fps and shouldn't pay for it. */
export const ATTRACT_MAX_FPS = 30

/** Frames rendered after the world is ready before a reduced-motion player's frame is held. */
export const REDUCED_MOTION_HOLD_FRAMES = 2

/**
 * A frame's idle time is at least this multiple of its own cost, so a slow device (a phone on the
 * `low` tier, software GL) spends at most a third of its main thread on the title and stays
 * responsive to taps. Fast frames never notice it: 4 ms of render asks for 12 ms of rest.
 */
export const ATTRACT_REST_FACTOR = 2

export interface FrameLimiter {
  /**
   * True when a frame is due at `nowMs`; calling it counts that frame as rendered. `lastCostMs`
   * is how long the previous frame took to render, which stretches the interval when the device
   * can't keep up with the cap.
   */
  due: (nowMs: number, lastCostMs?: number) => boolean
}

/**
 * Caps frames at `maxFps`. Browsers deliver animation frames on vsync, so a 33.3 ms interval on a
 * 60 Hz display lands on 33.3 ms steps that sit a hair under the interval; a half-frame of slack
 * keeps those from being skipped (which would drop the cap to 20 fps).
 */
export function createFrameLimiter(maxFps: number): FrameLimiter {
  const interval = 1000 / maxFps
  const slack = interval * 0.1
  let last = Number.NEGATIVE_INFINITY
  return {
    due: (nowMs, lastCostMs = 0) => {
      const rest = lastCostMs * ATTRACT_REST_FACTOR
      // The rest is counted from the last frame's start, so it holds the cost back too.
      if (nowMs - last < Math.max(interval - slack, lastCostMs + rest)) return false
      last = nowMs
      return true
    },
  }
}

export interface AttractFrameState {
  /** The document is hidden (background tab). */
  hidden: boolean
  /** The world is behind an opaque screen, so the last frame is enough. */
  covered: boolean
  reducedMotion: boolean
  /** The world is ready and the poster is gone or going. */
  ready: boolean
  /** Frames rendered since it became ready. */
  framesSinceReady: number
}

/**
 * Whether the attract world should render at all this tick: never while hidden or covered, and
 * under reduced motion only until it is ready plus a couple of frames, then one still is held.
 */
export function attractShouldRender({
  hidden,
  covered,
  reducedMotion,
  ready,
  framesSinceReady,
}: AttractFrameState): boolean {
  if (hidden || covered) return false
  if (reducedMotion && ready && framesSinceReady >= REDUCED_MOTION_HOLD_FRAMES) return false
  return true
}
