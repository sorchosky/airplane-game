import { useEffect } from 'react'
import { FRAME_PRIORITY, frameLoop } from '../app/frameLoop'
import { useControlStore } from '../app/controlStore'
import { useGameStore } from '../app/gameStore'
import { useFlightStore } from '../flight/flightStore'
import { useInputStore } from '../input/inputStore'
import { playCue, setDucked, setMuted, updateAudioParams } from './audioEngine'
import { computeAudioParams, type EngineWindParams } from './audioParams'
import { useAudioStore } from './audioStore'

/**
 * Drives the procedural engine/wind audio from flight state, plays the soft active/inactive and
 * countdown cues, and binds the M-key mute toggle. Mount once for the life of a flight (flying ⇄
 * paused), alongside `useControlStateDriver` -- see `App.tsx`'s `FlightControl`.
 */
export function useAudioEngine(): void {
  const paused = useGameStore((s) => s.state === 'paused')
  const muted = useAudioStore((s) => s.muted)

  useEffect(() => {
    setMuted(muted)
  }, [muted])

  useEffect(() => {
    setDucked(paused)
  }, [paused])

  // Silences on unmount (leaving the flight scene), independent of the duck effect above so a quit
  // straight from `flying` -- never paused -- doesn't leave the engine running at full gain.
  useEffect(() => {
    return () => setDucked(true)
  }, [])

  useEffect(() => {
    let lastActive: boolean | null = null
    let lastCountdown: number | null = null
    // One params object for the life of the flight; `computeAudioParams` fills it in place.
    const audioParams: EngineWindParams = {
      engineFreq: 0,
      engineGain: 0,
      windCutoff: 0,
      windGain: 0,
    }

    const tick = (): void => {
      const { state, params } = useFlightStore.getState()
      updateAudioParams(computeAudioParams(state, params, undefined, audioParams))

      const active = useInputStore.getState().current.active
      if (lastActive !== null && active !== lastActive) {
        playCue(active ? 'engaged' : 'disengaged')
      }
      lastActive = active

      const countdown = useControlStore.getState().view.countdown
      if (countdown !== null && countdown !== lastCountdown) {
        playCue('countdown')
      }
      lastCountdown = countdown
    }
    return frameLoop.add(tick, FRAME_PRIORITY.audio)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'm' || event.key === 'M') && !event.repeat) {
        useAudioStore.getState().toggleMuted()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
