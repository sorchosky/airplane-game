import { addAfterEffect, addEffect, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { ATTRACT_MAX_FPS, attractShouldRender, createFrameLimiter } from '../render/attractFrames'
import { useFrontDoorLookStore } from './frontDoorLookStore'
import { useWorldStore } from './worldStore'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface AttractFramesProps {
  /** An opaque screen covers the world: hold the last frame. */
  covered: boolean
}

/**
 * Drives the canvas's frames in attract (#153). The canvas runs `frameloop="demand"` there, and
 * this asks for a frame at most `ATTRACT_MAX_FPS` times a second, none while the document is
 * hidden or the world is covered, and under reduced motion only until the first terrain is drawn
 * (plus two frames), after which that one frame is held. A device that takes long to draw a frame
 * rests twice as long between frames (`ATTRACT_REST_FACTOR`). Mounted only in attract.
 */
export function AttractFrames({ covered }: AttractFramesProps) {
  const invalidate = useThree((s) => s.invalidate)
  const coveredRef = useRef(covered)
  coveredRef.current = covered
  const framesSinceReady = useRef(0)

  useFrame(() => {
    if (useWorldStore.getState().status === 'ready') framesSinceReady.current += 1
  })

  useEffect(() => {
    const limiter = createFrameLimiter(ATTRACT_MAX_FPS)
    const reducedMotion = prefersReducedMotion()
    // How long the last frame took to draw, so a device that can't hold 30 fps backs off.
    let frameStart = 0
    let lastCost = 0
    const offBefore = addEffect(() => {
      frameStart = performance.now()
    })
    const offAfter = addAfterEffect(() => {
      lastCost = performance.now() - frameStart
    })
    let raf = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const render = attractShouldRender({
        hidden: document.hidden,
        // The low tier holds the world on its blurred still (#159), so nothing is drawn under it.
        covered: coveredRef.current || useFrontDoorLookStore.getState().held,
        reducedMotion,
        ready: useWorldStore.getState().status === 'ready',
        framesSinceReady: framesSinceReady.current,
      })
      if (render && limiter.due(now, lastCost)) invalidate()
    }
    raf = requestAnimationFrame(tick)
    // A held frame (reduced motion) still has to redraw when the look jumps to its static blur.
    // Otherwise the limiter above paces the frames, and the look moving must not outrun it.
    const offLook = reducedMotion ? useFrontDoorLookStore.subscribe(() => invalidate()) : null
    return () => {
      offLook?.()
      cancelAnimationFrame(raf)
      offBefore()
      offAfter()
    }
  }, [invalidate])

  return null
}
