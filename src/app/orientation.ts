// `ScreenOrientation.lock` isn't in every browser (iOS Safari lacks it) or in TS's DOM lib, and
// where it exists it often rejects outside fullscreen. Typed locally so the call stays optional.
interface LockableOrientation {
  lock?: (orientation: 'landscape') => Promise<void>
}

/** Asks the browser to hold landscape. Call from the Start tap; fails silently where unsupported. */
export function tryLockLandscape(): void {
  try {
    const orientation = screen.orientation as unknown as LockableOrientation | undefined
    orientation?.lock?.('landscape').catch(() => undefined)
  } catch {
    // Some browsers throw synchronously instead of rejecting. Either way, the prompt covers it.
  }
}

export const PORTRAIT_QUERY = '(orientation: portrait)'
