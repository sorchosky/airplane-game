import { useEffect, useRef, useState } from 'react'
import { color, space, type } from '../styles/tokens'
import { usePerfStore } from './perfStore'

const TOGGLE_KEYS = new Set(['f', 'F'])

/**
 * Small fps / draw call / triangle readout, top right. Starts visible with `?debug`, and `F`
 * toggles it either way. Text is written straight into the DOM from an animation frame loop, so
 * it never re-renders React (see CLAUDE.md: no React state at frame rate). #27 grows this into
 * the full perf HUD.
 */
export function FpsCounter({ initiallyVisible }: { initiallyVisible: boolean }) {
  const [visible, setVisible] = useState(initiallyVisible)
  const textRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (TOGGLE_KEYS.has(event.key)) setVisible((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!visible) return
    let frame = 0
    const tick = () => {
      const { fps, frameMs, drawCalls, triangles, terrainTiles } = usePerfStore.getState()
      if (textRef.current) {
        textRef.current.textContent =
          `${fps.toFixed(0)} fps  ${frameMs.toFixed(1)} ms\n` +
          `${drawCalls} draws  ${(triangles / 1000).toFixed(0)}k tris\n` +
          `${terrainTiles} terrain tiles`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [visible])

  if (!visible) return null

  return (
    <pre
      ref={textRef}
      data-testid="fps-counter"
      style={{
        position: 'fixed',
        top: space.md,
        right: space.md,
        margin: 0,
        padding: space.sm,
        background: color.surfaceHud,
        color: color.textPrimary,
        fontSize: type.tvCaption,
        fontFamily: 'monospace',
        borderRadius: space.xs,
        pointerEvents: 'none',
      }}
    />
  )
}
