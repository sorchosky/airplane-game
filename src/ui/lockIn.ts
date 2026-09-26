import { create } from 'zustand'

/**
 * Lock-in handoff (#63, storyboard frame 03). When calibration completes, the calibrate screen
 * records where its preview frame was; the flight HUD, mounting a moment later, contracts its
 * corner preview from there and fades the world up. The two screens never exist together, so the
 * rectangle is passed through this store rather than by animating one element across both.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The preview contracts to the corner, and the world fades up, over this long. */
export const LOCK_IN_CONTRACT_MS = 600
/** The skeleton flashes white for this long before the handoff. */
export const LOCK_IN_FLASH_MS = 160
/** The chime's caption stays up this long, when captions are on. */
export const LOCK_IN_CAPTION_MS = 1800
/** A handoff older than this is stale (the HUD mounted for some other reason) and is ignored. */
export const LOCK_IN_STALE_MS = 1000

interface LockInStore {
  from: Rect | null
  atMs: number
}

export const useLockInStore = create<LockInStore>(() => ({ from: null, atMs: 0 }))

export function recordLockIn(from: Rect, nowMs: number): void {
  useLockInStore.setState({ from, atMs: nowMs })
}

/** The preview rectangle a lock-in just left, or null when there's no fresh one. */
export function recentLockIn(
  state: { from: Rect | null; atMs: number },
  nowMs: number,
): Rect | null {
  if (!state.from || nowMs - state.atMs > LOCK_IN_STALE_MS) return null
  return state.from
}

/**
 * FLIP keyframes that start `to` looking exactly like `from` and settle it into place. Assumes
 * `transform-origin: 0 0`. Null when `to` has no size yet.
 */
export function contractKeyframes(from: Rect, to: Rect): Keyframe[] | null {
  if (to.width <= 0 || to.height <= 0) return null
  const dx = from.x - to.x
  const dy = from.y - to.y
  const sx = from.width / to.width
  const sy = from.height / to.height
  return [
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
    { transform: 'translate(0px, 0px) scale(1, 1)' },
  ]
}

const CAPTIONS_STORAGE_KEY = 'driftwing.captions'

/**
 * Whether sound captions are on: `?captions` or a stored `driftwing.captions=1`. The setting
 * itself (and its toggle) arrives with the accessibility slice (#82); this is the hook it sets.
 */
export function captionsEnabled(search: string, stored: string | null): boolean {
  return new URLSearchParams(search).has('captions') || stored === '1'
}

/** `captionsEnabled` against the live URL and storage (which can throw in private mode). */
export function readCaptionsEnabled(): boolean {
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(CAPTIONS_STORAGE_KEY)
  } catch {
    stored = null
  }
  return captionsEnabled(window.location.search, stored)
}
