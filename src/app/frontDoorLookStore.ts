import { create } from 'zustand'

interface FrontDoorLookStore {
  /** The title camera's lean, 0 (masthead framing) to 1 (Choose framing). */
  lean: number
  /** The world blur strength, 0 (sharp) to 1 (full). */
  blur: number
  /**
   * Low tier only: draws the live world into the still the blur is applied to, and reports
   * whether it did. Registered by the scene, which owns the renderer.
   */
  captureStill: ((target: HTMLCanvasElement) => boolean) | null
  /** Low tier only: the world is held on its still, so attract stops drawing frames. */
  held: boolean
  setLook: (lean: number, blur: number) => void
  setCaptureStill: (capture: FrontDoorLookStore['captureStill']) => void
  setHeld: (held: boolean) => void
}

/**
 * The world's look behind the front door (#159), written by `FrontDoorStage` from the Start
 * timeline and read per frame by the title camera and the blur pass with `getState()`, so
 * nothing re-renders at frame rate.
 */
export const useFrontDoorLookStore = create<FrontDoorLookStore>((set, get) => ({
  lean: 0,
  blur: 0,
  captureStill: null,
  held: false,
  setLook: (lean, blur) => {
    const s = get()
    if (s.lean !== lean || s.blur !== blur) set({ lean, blur })
  },
  setCaptureStill: (captureStill) => set({ captureStill }),
  setHeld: (held) => set({ held }),
}))
