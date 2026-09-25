import { useEffect } from 'react'
import { useInputStore } from './inputStore'
import { rampTowards } from './ramp'
import { touchTargets } from './touchTargets'

/** Units per second the roll/pitch axes ramp toward their target when a key is held or released. */
const RAMP_RATE = 3

/** Flight-sim convention: W (or Up) pitches down (dive), S (or Down) pitches up (climb). Flip to invert. */
const INVERT_PITCH = false

const ROLL_LEFT_KEYS = new Set(['a', 'A', 'ArrowLeft'])
const ROLL_RIGHT_KEYS = new Set(['d', 'D', 'ArrowRight'])
const PITCH_DIVE_KEYS = new Set(['w', 'W', 'ArrowUp'])
const PITCH_CLIMB_KEYS = new Set(['s', 'S', 'ArrowDown'])
const TOGGLE_ACTIVE_KEYS = new Set([' '])

export function targetRoll(pressed: Set<string>): number {
  const left = [...pressed].some((key) => ROLL_LEFT_KEYS.has(key))
  const right = [...pressed].some((key) => ROLL_RIGHT_KEYS.has(key))
  if (left === right) return 0
  return left ? -1 : 1
}

export function targetPitch(pressed: Set<string>): number {
  const dive = [...pressed].some((key) => PITCH_DIVE_KEYS.has(key))
  const climb = [...pressed].some((key) => PITCH_CLIMB_KEYS.has(key))
  if (dive === climb) return 0
  const sign = dive ? -1 : 1
  return INVERT_PITCH ? -sign : sign
}

/**
 * Reads the keyboard (and, via `touchTargets`, the on-screen drag fallback) and writes a
 * smoothly ramped `ControlInput` into the input store every frame. This is the single writer for
 * the keyboard/touch source; `TouchControls` only updates `touchTargets`, it never writes to the
 * store itself, so the two never race. Mount once, near the app root, while `?input=keyboard`
 * (the default in dev).
 */
export function useKeyboardSource(): void {
  useEffect(() => {
    const pressed = new Set<string>()
    let active = false
    let frame = 0
    let lastTime = performance.now()

    const onKeyDown = (event: KeyboardEvent) => {
      pressed.add(event.key)
      if (TOGGLE_ACTIVE_KEYS.has(event.key)) {
        active = !active
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.key)
    }

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.1, (now - lastTime) / 1000)
      lastTime = now

      if (touchTargets.toggleActive) {
        active = !active
        touchTargets.toggleActive = false
      }

      const keyRoll = targetRoll(pressed)
      const keyPitch = targetPitch(pressed)

      const { current, setInput } = useInputStore.getState()
      setInput({
        roll: rampTowards(current.roll, keyRoll || touchTargets.roll, RAMP_RATE, dt),
        pitch: rampTowards(current.pitch, keyPitch || touchTargets.pitch, RAMP_RATE, dt),
        active,
        confidence: 1,
        source: 'keyboard',
      })

      frame = requestAnimationFrame(tick)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    frame = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      cancelAnimationFrame(frame)
    }
  }, [])
}
