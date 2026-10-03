/** Wait before the second try in a row, in ms. Doubles per failure after that. */
export const CONTEXT_RETRY_BASE_MS = 500

/** The longest wait between tries, in ms. */
export const CONTEXT_RETRY_MAX_MS = 8000

/**
 * Failures in a row after which a world that has never drawn stops trying: the device has no
 * usable WebGL, and the poster stays. A world that has drawn keeps trying, since the GPU that
 * refused a context during a memory squeeze (the camera's pose model shares it) usually gives one
 * back a few seconds later.
 */
export const CONTEXT_BOOT_RETRIES = 5

/** How long a new canvas must keep its context before earlier failures stop counting, in ms. */
export const CONTEXT_HEALTHY_MS = 5000

/**
 * How long to wait before mounting a new canvas after `failures` failed in a row (lost contexts
 * or renderers that couldn't be created), or `null` to stop trying. A single loss remounts at
 * once; only a canvas that fails again backs off.
 */
export function contextRetryDelayMs(failures: number, everReady: boolean): number | null {
  if (!everReady && failures > CONTEXT_BOOT_RETRIES) return null
  if (failures <= 1) return 0
  return Math.min(CONTEXT_RETRY_BASE_MS * 2 ** (failures - 2), CONTEXT_RETRY_MAX_MS)
}
