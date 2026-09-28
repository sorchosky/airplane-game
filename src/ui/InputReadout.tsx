import { useEffect, useRef } from 'react'
import { FRAME_PRIORITY, frameLoop } from '../app/frameLoop'
import { useGameStore } from '../app/gameStore'
import { useInputStore } from '../input/inputStore'
import { color } from '../styles/tokens'
import { createRollStability, updateRollStability } from './inputReadoutMath'

/** Thin horizon and wing marks under the plane, written directly from the input on every frame. */
export function InputReadout() {
  const root = useRef<SVGSVGElement>(null)
  const wing = useRef<SVGGElement>(null)

  useEffect(() => {
    const stability = createRollStability()
    return frameLoop.add((nowMs) => {
      const input = useInputStore.getState().current
      const visible = updateRollStability(stability, input.roll, input.active, nowMs)
      if (root.current) {
        root.current.style.opacity =
          visible && useGameStore.getState().state === 'flying' ? '1' : '0'
        root.current.style.color = input.active ? color.accent : color.controlInactive
      }
      if (wing.current)
        wing.current.setAttribute(
          'transform',
          `translate(0 ${-input.pitch * 12}) rotate(${input.roll * 30})`,
        )
    }, FRAME_PRIORITY.clock)
  }, [])

  return (
    <svg
      ref={root}
      data-testid="input-readout"
      aria-hidden="true"
      viewBox="-80 -24 160 48"
      style={{
        position: 'absolute',
        left: '50%',
        top: '62%',
        width: 160,
        height: 48,
        transform: 'translateX(-50%)',
        color: color.controlInactive,
        opacity: 1,
      }}
    >
      <path d="M-70 0 H-26 M26 0 H70" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <g ref={wing} fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M-25 0 H-6 L0 5 L6 0 H25" />
        <path d="M-25 -5 V5 M25 -5 V5" />
      </g>
    </svg>
  )
}
