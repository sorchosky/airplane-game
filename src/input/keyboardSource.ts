import { useEffect } from 'react'
import { FRAME_PRIORITY, frameLoop } from '../app/frameLoop'
import { useInputStore } from './inputStore'
import { rampTowards } from './ramp'
import { touchTargets } from './touchTargets'
import { mouseTargets } from './mouseSource'

/** Units per second the roll/pitch axes ramp toward their target when a key is held or released. */
const RAMP_RATE = 3

/** Flight-sim convention: W (or Up) pitches down (dive), S (or Down) pitches up (climb). Flip to invert. */
const INVERT_PITCH = false

const ROLL_LEFT_KEYS = new Set(['a', 'A', 'ArrowLeft'])
const ROLL_RIGHT_KEYS = new Set(['d', 'D', 'ArrowRight'])
const PITCH_DIVE_KEYS = new Set(['w', 'W', 'ArrowUp'])
const PITCH_CLIMB_KEYS = new Set(['s', 'S', 'ArrowDown'])
const TOGGLE_ACTIVE_KEYS = new Set([' '])
/** Held, like the arms-back sweep it stands in for (#93). */
const BOOST_KEYS = new Set(['Shift'])

function hasAnyKey(pressed: Set<string>, keys: Set<string>): boolean {
  for (const key of pressed) {
    if (keys.has(key)) return true
  }
  return false
}

export function targetRoll(pressed: Set<string>): number {
  const left = hasAnyKey(pressed, ROLL_LEFT_KEYS)
  const right = hasAnyKey(pressed, ROLL_RIGHT_KEYS)
  if (left === right) return 0
  return left ? -1 : 1
}

export function isBoosting(pressed: Set<string>): boolean {
  return hasAnyKey(pressed, BOOST_KEYS)
}

export function targetPitch(pressed: Set<string>): number {
  const dive = hasAnyKey(pressed, PITCH_DIVE_KEYS)
  const climb = hasAnyKey(pressed, PITCH_CLIMB_KEYS)
  if (dive === climb) return 0
  const sign = dive ? -1 : 1
  return INVERT_PITCH ? -sign : sign
}

/**
 * Reads keyboard plus mouse/touch targets and writes a smoothly ramped `ControlInput` into the
 * input store every frame. Pointer handlers only update targets, so this remains the single
 * writer. Mount once near the app root while keyboard input is selected.
 */
export function useKeyboardSource(enabled = true, mouseMode = false): void {
  useEffect(() => {
    if (!enabled) return
    const pressed = new Set<string>()
    let active = false
    let lastTime = performance.now()

    const onKeyDown = (event: KeyboardEvent) => {
      pressed.add(event.key)
      if (TOGGLE_ACTIVE_KEYS.has(event.key)) {
        active = !active
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.key)
      // Shift (boost) changes a letter's case between its keydown and keyup: D down, Shift down,
      // D up reports "D" and would leave "d" held forever.
      if (event.key.length === 1) {
        pressed.delete(event.key.toLowerCase())
        pressed.delete(event.key.toUpperCase())
      }
    }

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000)
      lastTime = now

      const keyRoll = targetRoll(pressed)
      const keyPitch = targetPitch(pressed)
      const rollHeld = hasAnyKey(pressed, ROLL_LEFT_KEYS) || hasAnyKey(pressed, ROLL_RIGHT_KEYS)
      const pitchHeld = hasAnyKey(pressed, PITCH_DIVE_KEYS) || hasAnyKey(pressed, PITCH_CLIMB_KEYS)

      const { current, setInput } = useInputStore.getState()
      setInput({
        roll: rampTowards(
          current.roll,
          rollHeld ? keyRoll : mouseMode ? mouseTargets.roll : touchTargets.roll,
          RAMP_RATE,
          dt,
        ),
        pitch: rampTowards(
          current.pitch,
          pitchHeld ? keyPitch : mouseMode ? mouseTargets.pitch : touchTargets.pitch,
          RAMP_RATE,
          dt,
        ),
        active: mouseMode
          ? document.hasFocus() && (mouseTargets.active || active || rollHeld || pitchHeld)
          : active || touchTargets.active,
        boost: isBoosting(pressed),
        confidence: 1,
        source: 'keyboard',
      })
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    const remove = frameLoop.add(tick, FRAME_PRIORITY.input)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      remove()
    }
  }, [enabled, mouseMode])
}
