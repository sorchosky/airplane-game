import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { useInputStore } from '../../input/inputStore'
import { getInputSourceFromUrl } from '../../input/source'
import { useCalibrationStore } from '../../pose/calibrationStore'
import { usePoseStore } from '../../pose/poseStore'
import { color, space, type } from '../../styles/tokens'
import { copy } from '../../ui/copy'
import { useControlStore } from '../controlStore'
import { useGameStore } from '../gameStore'
import {
  INITIAL_PAUSE_MENU,
  movePauseMenu,
  pauseMenuHoldProgress,
  stepPauseMenu,
  type PauseMenuItem,
} from '../pauseMenu'

/** Hold ring radius and circumference in viewBox units. */
const RING_RADIUS = 20
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function selectItem(item: PauseMenuItem | undefined): void {
  switch (item) {
    case 'resume':
      useControlStore.getState().startCountdown()
      return
    case 'recalibrate':
      // Forget the in-memory calibration so the calibrate screen runs the full hold instead of
      // reusing the one the player wants to replace.
      useCalibrationStore.getState().clearCalibration()
      useGameStore.getState().recalibrate()
      return
    case 'quit':
      useGameStore.getState().quitToTitle()
      return
    case undefined:
      return
  }
}

/** Arms-out hold progress around the highlighted item. The menu writes `strokeDashoffset`. */
function HoldRing({ ringRef }: { ringRef: Ref<SVGCircleElement> }) {
  return (
    <svg viewBox="0 0 48 48" width={48} height={48} aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle
        cx={24}
        cy={24}
        r={RING_RADIUS}
        fill="none"
        stroke={color.controlInactive}
        strokeWidth={5}
      />
      <circle
        ref={ringRef}
        cx={24}
        cy={24}
        r={RING_RADIUS}
        fill="none"
        stroke={color.controlActive}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE}
        transform="rotate(-90 24 24)"
      />
    </svg>
  )
}

/**
 * Pause menu (#28): Resume, Recalibrate, Quit to title, laid out left to right. Hands-free in
 * pose mode (tilt to move, level arms-out hold to pick; see `pauseMenu.ts`), plus arrow keys and
 * Enter, and tap or click. Recalibrate is left out in keyboard mode, which never calibrates.
 *
 * Gesture state lives in a ref and is stepped every animation frame; React re-renders only when
 * the highlight moves. The hold ring is written straight to the SVG. Nothing here animates, so
 * `prefers-reduced-motion` needs no special case: the highlight jumps and the ring only tracks
 * the hold.
 */
export function PauseMenu() {
  const keyboard = useMemo(() => getInputSourceFromUrl() === 'keyboard', [])
  const items = useMemo<PauseMenuItem[]>(
    () => (keyboard ? ['resume', 'quit'] : ['resume', 'recalibrate', 'quit']),
    [keyboard],
  )
  const personInFrame = usePoseStore((s) => s.frame !== null)
  const [highlight, setHighlight] = useState(INITIAL_PAUSE_MENU.index)
  const menuRef = useRef(INITIAL_PAUSE_MENU)
  const ringRef = useRef<SVGCircleElement>(null)

  const move = useCallback(
    (delta: number) => {
      menuRef.current = movePauseMenu(menuRef.current, delta, items.length)
      setHighlight(menuRef.current.index)
    },
    [items.length],
  )

  // Gestures. Keyboard mode's input store is driven by the arrow keys, which the key handler
  // below already reads, so stepping it here too would move the highlight twice.
  useEffect(() => {
    if (keyboard) return
    let frame = 0
    const tick = () => {
      const nowMs = performance.now()
      const { active, roll } = useInputStore.getState().current
      const { state, selected } = stepPauseMenu(
        menuRef.current,
        { active, roll, nowMs },
        items.length,
      )
      if (state !== menuRef.current) {
        menuRef.current = state
        setHighlight(state.index)
      }
      const ring = ringRef.current
      if (ring) {
        const progress = pauseMenuHoldProgress(state, nowMs)
        ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress))
      }
      if (selected !== null) {
        selectItem(items[selected])
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [items, keyboard])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') move(-1)
      else if (event.key === 'ArrowRight') move(1)
      else if (event.key === 'Enter') {
        // Stop a focused button from also firing its click.
        event.preventDefault()
        selectItem(items[menuRef.current.index])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items, move])

  const hint = keyboard
    ? copy.pause.keyboardHint
    : personInFrame
      ? copy.pause.gestureHint
      : copy.pause.stepIntoView

  return (
    <>
      <h2
        style={{
          fontFamily: type.fontDisplay,
          fontWeight: type.weightDisplay,
          fontSize: type.tvTitle,
          textTransform: 'uppercase',
          letterSpacing: type.trackingDisplay,
          margin: 0,
        }}
      >
        {copy.pause.title}
      </h2>
      <div
        data-testid="pause-menu"
        data-highlight={items[highlight]}
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: space.lg }}
      >
        {items.map((item, i) => {
          const highlighted = i === highlight
          return (
            <button
              key={item}
              type="button"
              aria-current={highlighted ? 'true' : undefined}
              onClick={() => selectItem(item)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.md,
                fontFamily: type.fontBody,
                fontWeight: type.weightButton,
                fontSize: type.tvBody,
                minHeight: 80,
                minWidth: 240,
                padding: `${space.md} ${space.xl}`,
                borderRadius: space.md,
                border: `4px solid ${highlighted ? color.accent : color.controlInactive}`,
                background: color.surfaceHud,
                color: highlighted ? color.textPrimary : color.textMuted,
                cursor: 'pointer',
              }}
            >
              {highlighted && !keyboard && <HoldRing ringRef={ringRef} />}
              {copy.pause[item]}
            </button>
          )
        })}
      </div>
      <p style={{ fontSize: type.tvBody, margin: 0, color: color.textMuted }}>{hint}</p>
    </>
  )
}
