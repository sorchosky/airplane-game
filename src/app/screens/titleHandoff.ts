import { create } from 'zustand'

interface TitleHandoffStore {
  /** The title sky's last frame (an image URL) while the Start hand-off plays, else null. */
  still: string | null
  begin: (still: string) => void
  end: () => void
}

/**
 * The Start hand-off (#73). `TitleScreen` begins it with a snapshot of its sky just before the
 * game leaves `title`; `App` keeps `TitleHandoff` mounted over whatever comes next until it ends.
 */
export const useTitleHandoffStore = create<TitleHandoffStore>((set) => ({
  still: null,
  begin: (still) => set({ still }),
  end: () => set({ still: null }),
}))
