import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { hasDebugFlag } from '../input/source'
import { createBeatController, type BeatAnimation, type BeatPlayer } from './beatTransition'
import { useControlModeStore } from './controlModeStore'
import { beatFor, type Beat } from './frontDoorBeats'
import { useFrontDoorLookStore } from './frontDoorLookStore'
import { useGameStore } from './gameStore'
import { CalibrateScreen } from './screens/CalibrateScreen'
import { ControlSelectScreen } from './screens/ControlSelectScreen'
import { ErrorScreen } from './screens/ErrorScreen'
import { createStartTimeline, type StartTimeline } from './screens/startTimeline'
import { restingLook, sampleStartTimeline } from './screens/startTransition'
import { RunningHeadTarget } from './screens/TitleText'
import { TitleScreen } from './screens/TitleScreen'

/** Reduced motion: every beat change is a 200 ms opacity crossfade, half out and half in. */
const REDUCED_FADE_MS = 100

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * An enter animation for a beat whose DOM isn't mounted yet. The beat controller asks for it as it
 * swaps the beat in, before React has rendered it; the stage attaches the real timeline in a
 * layout effect once it has. A reverse before then (the player backed out at once) just means
 * there is nothing to play.
 */
class PendingAnimation implements BeatAnimation {
  private inner: BeatAnimation | null = null
  private backed = false
  private resolveReady!: () => void
  private readonly ready = new Promise<void>((resolve) => {
    this.resolveReady = resolve
  })

  get finished(): Promise<unknown> {
    return this.inner ? this.inner.finished : this.ready
  }

  /** Attach the timeline, already playing, or null when there is none to play. */
  attach(animation: BeatAnimation | null): void {
    if (!animation || this.backed) {
      this.resolveReady()
      return
    }
    this.inner = animation
    animation.finished.then(this.resolveReady, this.resolveReady)
  }

  get reversedEarly(): boolean {
    return this.backed
  }

  reverse(): void {
    if (this.inner) this.inner.reverse()
    else this.backed = true
  }

  cancel(): void {
    this.inner?.cancel()
    this.resolveReady()
  }
}

interface StageRefs {
  root: { current: HTMLElement | null }
  /** The beat the controller is heading for, so an exit knows whether it is a Back. */
  target: { current: Beat }
  /** The beat shown before the current one, so an enter knows whether it follows the masthead. */
  previous: { current: Beat }
  timeline: { current: StartTimeline | null }
  pending: { current: PendingAnimation | null }
  /** Starts feeding the world's lean and blur from a timeline's clock. */
  drive: (timeline: StartTimeline, follow?: boolean) => void
}

/**
 * The stage's transitions (#159). Masthead → Choose is the Start timeline, played forward as the
 * enter and backward as the exit of a Back, and nothing else moves yet (hard cuts). Reduced motion
 * crossfades the whole stage instead, and the timeline just jumps to its end.
 */
function stagePlayer(refs: StageRefs): BeatPlayer {
  const fade = (from: number, to: number): BeatAnimation | null => {
    const el = refs.root.current
    if (!el || !reducedMotion()) return null
    return el.animate([{ opacity: from }, { opacity: to }], {
      duration: REDUCED_FADE_MS,
      easing: 'linear',
      fill: 'both',
    })
  }
  return {
    exit(beat) {
      if (reducedMotion()) return fade(1, 0)
      const timeline = refs.timeline.current
      if (beat === 'choose' && refs.target.current === 'masthead' && timeline) {
        timeline.playBackward()
        refs.drive(timeline)
        return timeline
      }
      return null
    },
    enter(beat) {
      if (reducedMotion()) return fade(0, 1)
      if (beat === 'choose' && refs.previous.current === 'masthead') {
        refs.pending.current = new PendingAnimation()
        return refs.pending.current
      }
      return null
    },
  }
}

/** Writes the world's lean and blur from the timeline's clock each frame until `finished`. */
function useLookDriver(settle: () => void) {
  const stop = useRef<(() => void) | null>(null)
  const settleRef = useRef(settle)
  settleRef.current = settle
  const halt = () => {
    stop.current?.()
    stop.current = null
  }
  const drive = (timeline: StartTimeline, follow = false) => {
    halt()
    let live = true
    let raf = 0
    const tick = () => {
      if (!live) return
      const sample = sampleStartTimeline(timeline.time(), timeline.frameCount)
      useFrontDoorLookStore.getState().setLook(sample.lean, sample.blur)
      raf = requestAnimationFrame(tick)
    }
    tick()
    const end = () => {
      if (!live) return
      live = false
      cancelAnimationFrame(raf)
      settleRef.current()
    }
    // Reversing a running animation keeps its pending `finished`, which then resolves at
    // whichever end it reaches, so one watch covers a forward run and a Back.
    if (!follow) void timeline.finished.then(end, end)
    stop.current = () => {
      live = false
      cancelAnimationFrame(raf)
    }
  }
  useEffect(() => halt, [])
  return { drive, halt }
}

/** The beat being shown, lagging the game state while the old beat plays its exit. */
function useBeatTransition(beat: Beat, player: BeatPlayer, onShow: (beat: Beat) => void): Beat {
  const [shown, setShown] = useState(beat)
  const controller = useMemo(
    () =>
      createBeatController(
        player,
        (next) => {
          onShow(next)
          setShown(next)
        },
        beat,
      ),
    // The controller owns the schedule for the stage's whole life; `beat` only seeds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useLayoutEffect(() => controller.go(beat), [controller, beat])
  useEffect(() => () => controller.dispose(), [controller])
  return shown
}

/**
 * Escape and browser back from the choice return to the title. Entering `select` pushes one
 * history entry so Back has something to pop; Escape pops it, and the popstate does the quit.
 */
function useChooseExit(active: boolean) {
  useEffect(() => {
    if (!active) return
    window.history.pushState({ frontDoor: 'choose' }, '')
    const quit = () => useGameStore.getState().quitToTitle()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat) return
      if (window.history.state?.frontDoor === 'choose') window.history.back()
      else quit()
    }
    window.addEventListener('popstate', quit)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', quit)
      window.removeEventListener('keydown', onKey)
    }
  }, [active])
}

/**
 * One persistent overlay from `title` through `calibrate` (#156). It stays mounted across beats and
 * swaps its content in place; the game state machine is unchanged. Once the beat is `flight` it
 * renders nothing but keeps its root, so a quit back to the title enters without a remount.
 *
 * The Choose beat keeps the masthead mounted under it (#159): Start's timeline moves the
 * wordmark into the running head and fades the rest, and Back plays it in reverse.
 */
export function FrontDoorStage() {
  const state = useGameStore((s) => s.state)
  const controlMode = useControlModeStore((s) => s.controlMode)
  const rootRef = useRef<HTMLDivElement>(null)
  const runningHeadRef = useRef<HTMLSpanElement>(null)
  const beat = beatFor(state, controlMode)

  const targetRef = useRef<Beat>(beat)
  const previousRef = useRef<Beat>(beat)
  const shownRef = useRef<Beat>(beat)
  const timelineRef = useRef<StartTimeline | null>(null)
  const pendingRef = useRef<PendingAnimation | null>(null)

  const settle = () => {
    const { lean, blur } = restingLook(targetRef.current)
    useFrontDoorLookStore.getState().setLook(lean, blur)
  }
  const { drive, halt } = useLookDriver(settle)

  const player = useMemo(
    () =>
      stagePlayer({
        root: rootRef,
        target: targetRef,
        previous: previousRef,
        timeline: timelineRef,
        pending: pendingRef,
        drive,
      }),
    // `drive` reads its settle callback through a ref; the player lives as long as the stage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const shown = useBeatTransition(beat, player, (next) => {
    previousRef.current = shownRef.current
    shownRef.current = next
  })

  // The controller learns of a change in a layout effect, so the target is set before it runs.
  targetRef.current = beat

  // Build or drop the Start timeline as the Choose beat comes and goes.
  useLayoutEffect(() => {
    const clear = () => {
      timelineRef.current?.cancel()
      timelineRef.current = null
    }
    const root = rootRef.current
    const head = runningHeadRef.current
    if (shown !== 'choose' || !root || !head) {
      clear()
      halt()
      pendingRef.current?.attach(null)
      pendingRef.current = null
      const { lean, blur } = restingLook(shown)
      useFrontDoorLookStore.getState().setLook(lean, blur)
      return
    }
    const pending = pendingRef.current
    pendingRef.current = null
    clear()
    const timeline = createStartTimeline(root, head)
    timelineRef.current = timeline
    const played = timeline !== null && pending !== null && !pending.reversedEarly
    if (played) {
      // Start was tapped: play the timeline from the masthead.
      timeline.playForward()
      drive(timeline)
    } else {
      // Arrived without Start (reduced motion, or back from calibrate): hold the Choose beat.
      timeline?.jumpToEnd()
      halt()
      const { lean, blur } = restingLook('choose')
      useFrontDoorLookStore.getState().setLook(lean, blur)
    }
    pending?.attach(played ? timeline : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  // `drive` reads everything through refs, so the hook installs once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => installStartTimelineHook(timelineRef, drive), [])

  useChooseExit(state === 'select')

  const masthead = shown === 'masthead' || shown === 'choose'

  return (
    <div
      ref={rootRef}
      data-beat={shown}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: shown === 'flight' ? 'none' : undefined,
      }}
    >
      {masthead && (
        // Under the choice the masthead is only the wordmark's running head: not for tapping.
        <div style={{ position: 'absolute', inset: 0 }} inert={shown === 'choose'}>
          {state === 'error' ? <ErrorScreen /> : <TitleScreen />}
        </div>
      )}
      {shown === 'choose' && <ControlSelectScreen />}
      {shown === 'position' && <CalibrateScreen />}
      {masthead && <RunningHeadTarget ref={runningHeadRef} />}
    </div>
  )
}

/**
 * `window.__startTimeline` under `?debug`, for screenshots at fixed points: `pin(ms)` holds the
 * Start timeline (and with it the world's lean and blur) at `ms`, `release()` lets it run.
 */
function installStartTimelineHook(
  timeline: { current: StartTimeline | null },
  drive: (timeline: StartTimeline, follow?: boolean) => void,
): () => void {
  if (!hasDebugFlag()) return () => undefined
  window.__startTimeline = {
    pin: (ms) => {
      const current = timeline.current
      if (!current) return
      current.pin(ms)
      // The look follows the clock for as long as it is held, even if the run had finished.
      drive(current, true)
    },
    release: () => {
      const current = timeline.current
      if (!current) return
      current.release()
      drive(current)
    },
    time: () => timeline.current?.time() ?? null,
    look: () => {
      const { lean, blur } = useFrontDoorLookStore.getState()
      return { lean, blur }
    },
  }
  return () => {
    delete window.__startTimeline
  }
}

declare global {
  interface Window {
    /** Pins the Start → Choose timeline for screenshots; present only under `?debug`. */
    __startTimeline?: {
      pin: (ms: number) => void
      release: () => void
      time: () => number | null
      look: () => { lean: number; blur: number }
    }
  }
}
