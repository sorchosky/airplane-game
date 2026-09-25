import { useEffect } from 'react'
import { useControlStore } from '../app/controlStore'
import { useGameStore } from '../app/gameStore'
import { useFlightStore } from '../flight/flightStore'
import { useInputStore } from '../input/inputStore'
import { playCue, setDucked, setMuted, updateAudioParams } from './audioEngine'
import { computeAudioParams } from './audioParams'
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
    let frame = 0
    let lastActive: boolean | null = null
    let lastCountdown: number | null = null

    const tick = () => {
      const { state, params } = useFlightStore.getState()
      updateAudioParams(computeAudioParams(state, params))

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

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
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
