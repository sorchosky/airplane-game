const STORAGE_KEY = 'skyborne.audio.muted'

/** Same shape as `pose/calibration.ts`'s load/save pair: a storage param (so tests don't touch the
 * real `localStorage`) and a try/catch, since quota errors or privacy mode can throw on either call. */
export function loadMuted(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveMuted(storage: Pick<Storage, 'setItem'> | undefined, muted: boolean): void {
  try {
    storage?.setItem(STORAGE_KEY, String(muted))
  } catch {
    // Quota or privacy mode: mute still applies for this session via the store.
  }
}
