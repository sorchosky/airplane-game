// Keeps the screen awake during play. The phone is propped up and mirrored
// to a TV for the whole session, so letting it sleep would end the game.
// Unsupported browsers (no Wake Lock API, or a permission refusal) fail
// silently — losing the lock is better than blocking the game on it.

let sentinel: WakeLockSentinel | null = null

export async function acquireWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return
  try {
    sentinel = await navigator.wakeLock.request('screen')
  } catch {
    sentinel = null
  }
}

export function releaseWakeLock(): void {
  sentinel?.release().catch(() => undefined)
  sentinel = null
}

/** Re-acquires the lock when the tab becomes visible again; the OS releases it on hide. */
export function setupWakeLockReacquire(): () => void {
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && sentinel) {
      void acquireWakeLock()
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => document.removeEventListener('visibilitychange', onVisibilityChange)
}
