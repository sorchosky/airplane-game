import type { Beat } from './frontDoorBeats'

/** The slice of a Web Animation the scheduler drives. */
export interface BeatAnimation {
  reverse(): void
  cancel(): void
  finished: Promise<unknown>
}

/** Plays a beat's exit or enter. Returning null means a hard cut: no animation, no waiting. */
export interface BeatPlayer {
  exit(beat: Beat): BeatAnimation | null
  enter(beat: Beat): BeatAnimation | null
}

export interface BeatController {
  /** The beat the stage should be showing right now (lags `go` while an exit plays). */
  shown(): Beat
  go(beat: Beat): void
  dispose(): void
}

type Phase = 'exit' | 'enter' | 'restore'

/**
 * Schedules beat changes as exit (old beat) then swap then enter (new beat), and never stacks
 * animations:
 * - a change during an exit just retargets it, and back to the beat being left reverses it;
 * - a change during an enter reverses that enter and swaps once it has run back out.
 * Pure of React and the DOM so the scheduling is unit tested with a fake player.
 */
export function createBeatController(
  player: BeatPlayer,
  onShow: (beat: Beat) => void,
  initial: Beat,
): BeatController {
  let shown = initial
  let target = initial
  let run = 0
  let active: { anim: BeatAnimation; phase: Phase } | null = null
  let disposed = false

  const play = (anim: BeatAnimation, phase: Phase, then: () => void) => {
    const id = ++run
    active = { anim, phase }
    const done = () => {
      if (disposed || id !== run) return
      active = null
      then()
    }
    anim.finished.then(done, () => undefined)
  }

  const commit = () => {
    shown = target
    onShow(shown)
    const anim = player.enter(shown)
    if (anim) play(anim, 'enter', () => undefined)
  }

  const leave = () => {
    const anim = player.exit(shown)
    if (!anim) return commit()
    play(anim, 'exit', commit)
  }

  return {
    shown: () => shown,
    go(beat) {
      if (beat === target) return
      target = beat
      if (!active) {
        if (beat !== shown) leave()
        return
      }
      if (active.phase === 'exit') {
        // Retargeted mid-exit: the running exit commits `target` when it finishes. Going back to
        // the beat being left reverses it instead.
        if (beat === shown) {
          const { anim } = active
          anim.reverse()
          play(anim, 'restore', () => undefined)
        }
        return
      }
      // Mid-enter or mid-restore: run what is playing back out, then swap.
      const { anim } = active
      anim.reverse()
      play(anim, 'exit', () => {
        if (target === shown) return
        commit()
      })
    },
    dispose() {
      disposed = true
      active?.anim.cancel()
      active = null
    },
  }
}
