import { useEffect, useRef } from 'react'
import { usePerfStore } from './perfStore'

/**
 * Hidden marker for `tests/e2e/shots.spec.ts`: says when the terrain around a `?shot=` bookmark
 * has finished streaming, and carries the renderer counts for the capture log. Written straight
 * to the DOM from an animation frame loop, never as React state.
 */
export function ShotReady() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const el = ref.current
      const { terrainReady, drawCalls, triangles, terrainTiles } = usePerfStore.getState()
      if (el) {
        el.dataset.ready = terrainReady ? 'true' : 'false'
        el.dataset.draws = String(drawCalls)
        el.dataset.tris = String(triangles)
        el.dataset.tiles = String(terrainTiles)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <div ref={ref} data-testid="shot-ready" data-ready="false" hidden />
}
