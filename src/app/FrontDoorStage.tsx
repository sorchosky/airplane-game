import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createBeatController, type BeatAnimation, type BeatPlayer } from './beatTransition'
import { useControlModeStore } from './controlModeStore'
import { beatFor, type Beat } from './frontDoorBeats'
import { useGameStore } from './gameStore'
import { CalibrateScreen } from './screens/CalibrateScreen'
import { ControlSelectScreen } from './screens/ControlSelectScreen'
import { ErrorScreen } from './screens/ErrorScreen'
import { TitleScreen } from './screens/TitleScreen'

/** Reduced motion: every beat change is a 200 ms opacity crossfade, half out and half in. */
const REDUCED_FADE_MS = 100

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Shared transition plumbing the beat tickets fill in. Today normal motion is a hard cut (null);
 * reduced motion crossfades the whole stage. Beat tickets replace the null branch per beat.
 */
function stagePlayer(root: () => HTMLElement | null): BeatPlayer {
  const fade = (from: number, to: number): BeatAnimation | null => {
    const el = root()
    if (!el || !reducedMotion()) return null
    return el.animate([{ opacity: from }, { opacity: to }], {
      duration: REDUCED_FADE_MS,
      easing: 'linear',
      fill: 'both',
    })
  }
  return { exit: () => fade(1, 0), enter: () => fade(0, 1) }
}

/** The beat being shown, lagging the game state while the old beat plays its exit. */
function useBeatTransition(beat: Beat, player: BeatPlayer): Beat {
  const [shown, setShown] = useState(beat)
  const controller = useMemo(
    () => createBeatController(player, setShown, beat),
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
 */
export function FrontDoorStage() {
  const state = useGameStore((s) => s.state)
  const controlMode = useControlModeStore((s) => s.controlMode)
  const rootRef = useRef<HTMLDivElement>(null)
  const player = useMemo(() => stagePlayer(() => rootRef.current), [])
  const shown = useBeatTransition(beatFor(state, controlMode), player)

  useChooseExit(state === 'select')

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
      {shown === 'masthead' && (state === 'error' ? <ErrorScreen /> : <TitleScreen />)}
      {shown === 'choose' && <ControlSelectScreen />}
      {shown === 'position' && <CalibrateScreen />}
    </div>
  )
}
