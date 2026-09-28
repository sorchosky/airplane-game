import { useEffect, useRef } from 'react'
import { useControlStore } from '../app/controlStore'
import { FRAME_PRIORITY, frameLoop } from '../app/frameLoop'
import { useGameStore } from '../app/gameStore'
import { color, space, type } from '../styles/tokens'
import { copy } from './copy'

const CIRCUMFERENCE = 2 * Math.PI * 20

/** First arms-drop teaches the five-second pause with the actual machine's elapsed time. */
export function PauseTeaching({ onChange }: { onChange: (visible: boolean) => void }) {
  const ring = useRef<SVGCircleElement>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let seenActive = false
    let taught = false
    let showing = false
    return frameLoop.add((nowMs) => {
      const game = useGameStore.getState().state
      const machine = useControlStore.getState().machine
      if (machine.phase === 'active') seenActive = true
      if (game === 'paused' && seenActive) taught = true
      const visible = game === 'flying' && seenActive && !taught && machine.phase === 'inactive'
      if (visible !== showing) {
        showing = visible
        onChange(visible)
      }
      if (root.current) root.current.style.opacity = visible ? '1' : '0'
      if (ring.current && visible)
        ring.current.style.strokeDashoffset = String(
          CIRCUMFERENCE * (1 - Math.min(1, (nowMs - machine.sinceMs) / 5000)),
        )
    }, FRAME_PRIORITY.clock)
  }, [onChange])

  return (
    <div
      ref={root}
      data-testid="pause-teaching"
      style={{
        position: 'absolute',
        top: '70%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        alignItems: 'center',
        gap: space.md,
        padding: `${space.sm} ${space.lg}`,
        background: color.surfaceHud,
        color: color.textPrimary,
        fontFamily: type.fontBody,
        fontSize: type.tvBody,
        whiteSpace: 'nowrap',
        opacity: 0,
      }}
    >
      <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" fill="none" stroke={color.controlInactive} strokeWidth="4" />
        <circle
          ref={ring}
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke={color.accent}
          strokeWidth="4"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE}
          transform="rotate(-90 24 24)"
        />
      </svg>
      {copy.pause.armsDown}
    </div>
  )
}
