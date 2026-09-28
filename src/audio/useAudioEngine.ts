import { useEffect } from 'react'
import { FRAME_PRIORITY, frameLoop } from '../app/frameLoop'
import { useControlStore } from '../app/controlStore'
import { useGameStore } from '../app/gameStore'
import { useFlightStore } from '../flight/flightStore'
import { useInputStore } from '../input/inputStore'
import { useCloudStore } from '../world/cloudStore'
import { getLandmarks, insideTrigger } from '../world/landmarks'
import { playCue, playWhoosh, setDucked, setMuted, updateAudioParams } from './audioEngine'
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
    const landmarks = getLandmarks()
    const nearest = new Float64Array(landmarks.length)
    const armed = new Uint8Array(landmarks.length)
    const ringInside = new Uint8Array(landmarks.length)
    const position: [number, number, number] = [0, 0, 0]
    let lastCloudBursts = useCloudStore.getState().bursts
    let ringSwellUntil = 0
    let lowRushActive = false
    const flightAudioInput = {
      speed: 0,
      pitchAngle: 0,
      bank: 0,
      floorContact: 0,
      cloudInside: false,
    }
    // One params object for the life of the flight; `computeAudioParams` fills it in place.
    const audioParams: EngineWindParams = {
      engineFreq: 0,
      engineGain: 0,
      windCutoff: 0,
      windGain: 0,
    }

    const tick = (): void => {
      const { state, params } = useFlightStore.getState()
      const cloud = useCloudStore.getState()
      if (cloud.bursts !== lastCloudBursts) playWhoosh('cloud')
      lastCloudBursts = cloud.bursts
      position[0] = state.position.x
      position[1] = state.position.y
      position[2] = state.position.z
      for (let i = 0; i < landmarks.length; i += 1) {
        const landmark = landmarks[i]
        if (!landmark) continue
        const dx = landmark.soundAnchor[0] - position[0]
        const dy = landmark.soundAnchor[1] - position[1]
        const dz = landmark.soundAnchor[2] - position[2]
        const distance = Math.hypot(dx, dy, dz)
        // Arm on approach; one pass per encounter, rearming only after leaving the area.
        if (distance > 250) armed[i] = 1
        if (armed[i] && distance < 95 && distance < (nearest[i] ?? Infinity)) {
          const forwardX = -Math.sin(state.heading) * Math.cos(state.pitchAngle)
          const forwardY = Math.sin(state.pitchAngle)
          const forwardZ = -Math.cos(state.heading) * Math.cos(state.pitchAngle)
          const closing =
            distance > 0
              ? (state.speed * (forwardX * dx + forwardY * dy + forwardZ * dz)) / distance
              : 0
          playWhoosh('landmark', closing)
          armed[i] = 0
        }
        nearest[i] = distance
        const inside = insideTrigger(landmark.trigger, position)
        if (inside && !ringInside[i]) {
          playWhoosh('ring')
          ringSwellUntil = performance.now() + 2400
        }
        ringInside[i] = inside ? 1 : 0
      }
      flightAudioInput.speed = state.speed
      flightAudioInput.pitchAngle = state.pitchAngle
      flightAudioInput.bank = state.bank
      flightAudioInput.floorContact = state.floorContact
      const lowRushNow = state.floorContact > 0.25
      if (lowRushNow && !lowRushActive) playWhoosh('lowPass')
      lowRushActive = lowRushNow
      flightAudioInput.cloudInside = cloud.inside
      computeAudioParams(flightAudioInput, params, undefined, audioParams)
      if (performance.now() < ringSwellUntil) {
        audioParams.padGain = (audioParams.padGain ?? 0) + 0.07
        audioParams.textureGain = (audioParams.textureGain ?? 0) + 0.03
      }
      updateAudioParams(audioParams)

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
    const unsubscribeFrame = frameLoop.add(tick, FRAME_PRIORITY.audio)
    return unsubscribeFrame
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
