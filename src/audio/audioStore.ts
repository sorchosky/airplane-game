import { create } from 'zustand'
import { loadMuted, saveMuted } from './audioSettings'

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

interface AudioStore {
  /** Persists across sessions. The M key toggles it; a pause menu item can follow (#28). */
  muted: boolean
  setMuted: (muted: boolean) => void
  toggleMuted: () => void
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  muted: loadMuted(storage()),
  setMuted: (muted) => {
    saveMuted(storage(), muted)
    set({ muted })
  },
  toggleMuted: () => get().setMuted(!get().muted),
}))
