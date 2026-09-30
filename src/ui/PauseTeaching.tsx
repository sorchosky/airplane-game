import { useEffect, useRef } from 'react'
import { useControlStore } from '../app/controlStore'
import { DEFAULT_CONTROL_MACHINE_PARAMS } from '../app/controlStateMachine'
import { FRAME_PRIORITY, frameLoop } from '../app/frameLoop'
import { useGameStore } from '../app/gameStore'
import { color, effect, motion, space, type } from '../styles/tokens'
import { copy } from './copy'
import { HairlineRule } from './HairlineRule'
import { createPauseTeachingState, stepPauseTeaching } from './pauseTeachingState'

const CIRCUMFERENCE = 2 * Math.PI * 20

/** First arms-drop teaches the five-second pause with the actual machine's elapsed time. */
export function PauseTeaching({
  eligible,
  onChange,
}: {
  eligible: boolean
  onChange: (visible: boolean) => void
}) {
  const ring = useRef<SVGCircleElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    let state = createPauseTeachingState()
    let suppressing = false
    return frameLoop.add((nowMs) => {
      const game = useGameStore.getState().state
      const machine = useControlStore.getState().machine
      const view = stepPauseTeaching(
        state,
        {
          eligible,
          game,
          controlPhase: machine.phase,
          controlSinceMs: machine.sinceMs,
          nowMs,
          reducedMotion,
        },
        motion.promptFadeMs,
        DEFAULT_CONTROL_MACHINE_PARAMS.pauseAfterMs,
      )
      state = view.state
      if (view.suppressControlPrompt !== suppressing) {
        suppressing = view.suppressControlPrompt
        onChange(suppressing)
      }
      if (root.current) root.current.style.opacity = view.shown ? '1' : '0'
      if (ring.current)
        ring.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - view.progress))
    }, FRAME_PRIORITY.clock)
  }, [eligible, onChange, reducedMotion])

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
        color: color.textPrimary,
        textShadow: effect.textGlow,
        fontFamily: type.fontBody,
        fontSize: type.tvBody,
        whiteSpace: 'nowrap',
        opacity: 0,
        transition: reducedMotion
          ? 'none'
          : `opacity ${motion.promptFadeMs}ms ${motion.promptFadeEase}`,
      }}
    >
      <svg
        viewBox="0 0 48 48"
        width="48"
        height="48"
        aria-hidden="true"
        style={{ filter: effect.ringGlow }}
      >
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
      <HairlineRule />
      {copy.pause.armsDown}
    </div>
  )
}
