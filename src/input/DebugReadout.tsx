import { useEffect, useRef } from 'react'
import { color, space, type } from '../styles/tokens'
import { useInputStore } from './inputStore'

/**
 * Live roll/pitch/active readout behind `?debug`. Mutates text content directly from a
 * `requestAnimationFrame` loop instead of subscribing to the store as React state, so it doesn't
 * force a re-render every frame (see CLAUDE.md: no React state at frame rate).
 */
export function DebugReadout() {
  const rollRef = useRef<HTMLSpanElement>(null)
  const pitchRef = useRef<HTMLSpanElement>(null)
  const activeRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frame = 0

    const tick = () => {
      const { current } = useInputStore.getState()
      if (rollRef.current) rollRef.current.textContent = current.roll.toFixed(2)
      if (pitchRef.current) pitchRef.current.textContent = current.pitch.toFixed(2)
      if (activeRef.current) activeRef.current.textContent = current.active ? 'true' : 'false'
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: space.md,
        left: space.md,
        padding: space.sm,
        background: color.surfaceHud,
        color: color.textPrimary,
        fontSize: type.tvCaption,
        fontFamily: 'monospace',
        borderRadius: space.xs,
        pointerEvents: 'none',
      }}
    >
      <div>
        roll: <span ref={rollRef}>0.00</span>
      </div>
      <div>
        pitch: <span ref={pitchRef}>0.00</span>
      </div>
      <div>
        active: <span ref={activeRef}>false</span>
      </div>
    </div>
  )
}
