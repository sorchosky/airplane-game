/**
 * One animation-frame loop for the per-frame jobs that feed the flight sim: input sources, the
 * control-state machine and the audio driver. Each registers a callback with a priority; every
 * frame runs them in priority order, then the next frame is requested. One `requestAnimationFrame`
 * per frame instead of one per job, and a fixed order (inputs before the control machine before
 * audio) instead of whichever job happened to mount first.
 *
 * Pure scheduling: the loop takes the frame scheduler as a parameter, so it tests without a DOM.
 * The React Three Fiber render loop stays separate; it reads the stores these jobs write.
 */
export type FrameJob = (nowMs: number, deltaMs: number) => void

export interface FrameJobEntry {
  job: FrameJob
  priority: number
  /** Set when removed during a frame; swept once the frame's jobs have all run. */
  removed: boolean
}

/** Fixed priorities. Lower runs first. */
export const FRAME_PRIORITY = {
  /** Pose detections that don't come from the camera (the replay source) land before inputs read them. */
  detections: -10,
  input: 0,
  control: 10,
  audio: 20,
  /** The in-game clock only needs the game state, so it runs last. */
  clock: 30,
} as const

export interface FrameScheduler {
  request: (callback: (nowMs: number) => void) => number
  cancel: (handle: number) => void
}

export interface FrameLoop {
  /** Registers `job`; returns a function that removes it. The loop starts with the first job. */
  add: (job: FrameJob, priority: number) => () => void
  /** Number of registered jobs, for tests. */
  readonly size: number
  /** Runs one frame by hand (tests only; the scheduler drives it otherwise). */
  tick: (nowMs: number) => void
}

export function createFrameLoop(scheduler: FrameScheduler): FrameLoop {
  const jobs: FrameJobEntry[] = []
  let handle: number | null = null
  let lastMs = Number.NaN
  let running = false
  let swept = true

  const stopIfEmpty = (): void => {
    if (jobs.length === 0 && handle !== null) {
      scheduler.cancel(handle)
      handle = null
      lastMs = Number.NaN
    }
  }

  const tick = (nowMs: number): void => {
    const deltaMs = Number.isNaN(lastMs) ? 0 : nowMs - lastMs
    lastMs = nowMs
    running = true
    for (let i = 0; i < jobs.length; i++) {
      const entry = jobs[i]
      if (entry && !entry.removed) entry.job(nowMs, deltaMs)
    }
    running = false
    // A job that removed itself (or another) mid-frame is only flagged, so the loop above never
    // skips an entry; drop the flagged ones now, in place, without allocating.
    if (!swept) {
      for (let i = jobs.length - 1; i >= 0; i--) {
        if (jobs[i]?.removed) jobs.splice(i, 1)
      }
      swept = true
    }
  }

  const frame = (nowMs: number): void => {
    handle = null
    tick(nowMs)
    if (jobs.length > 0) handle = scheduler.request(frame)
  }

  return {
    add: (job, priority) => {
      const entry: FrameJobEntry = { job, priority, removed: false }
      // Insert after every entry with the same or lower priority, so equal priorities keep
      // registration order.
      let at = jobs.length
      while (at > 0 && (jobs[at - 1]?.priority ?? 0) > priority) at -= 1
      jobs.splice(at, 0, entry)
      if (handle === null) handle = scheduler.request(frame)
      return () => {
        if (entry.removed) return
        entry.removed = true
        if (running) {
          swept = false
          return
        }
        const index = jobs.indexOf(entry)
        if (index >= 0) jobs.splice(index, 1)
        stopIfEmpty()
      }
    },
    get size() {
      return jobs.length
    },
    tick,
  }
}

/** The app's loop on the browser's animation frames. */
export const frameLoop: FrameLoop = createFrameLoop({
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
})
