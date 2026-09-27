import { create } from 'zustand'

/**
 * Fly-through state for the cumulus layer (#70). Written by `Clouds` only when something changes
 * (entering or leaving a heap, a burst starting), never per frame.
 *
 * This is the audio hook for F3 (#78): subscribe to `bursts` for the whoosh as the plane punches
 * into a cloud, and to `inside` for a muffled bed while it's in one. The screen veil
 * (`ui/CloudVeil.tsx`) listens to `bursts` the same way.
 */
interface CloudStore {
  /** True while the plane is inside a cumulus heap. */
  inside: boolean
  /** Counts up once per fly-through burst. */
  bursts: number
}

export const useCloudStore = create<CloudStore>(() => ({
  inside: false,
  bursts: 0,
}))
