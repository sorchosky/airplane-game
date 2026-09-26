import { useLayoutEffect, useRef, useState } from 'react'
import { color, space, type } from '../styles/tokens'
import { copy } from './copy'
import {
  LOCK_IN_CAPTION_MS,
  LOCK_IN_CONTRACT_MS,
  readCaptionsEnabled,
  recentLockIn,
  useLockInStore,
} from './lockIn'

/**
 * The flight half of the lock-in (#63, storyboard frame 03): right after calibration the world
 * fades up from the calibrate screen's dark over the same 600 ms the corner preview contracts, and
 * the chime's caption shows when captions are on. Renders nothing on any other mount.
 */
export function LockInReveal() {
  const [lockIn] = useState(() => recentLockIn(useLockInStore.getState(), performance.now()))
  const [fading, setFading] = useState(lockIn !== null)
  const [caption, setCaption] = useState(() => lockIn !== null && readCaptionsEnabled())
  const scrimRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const scrim = scrimRef.current
    if (!scrim) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const animation = scrim.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reducedMotion ? 0 : LOCK_IN_CONTRACT_MS,
      easing: 'ease-out',
      fill: 'forwards',
    })
    animation.finished.then(
      () => setFading(false),
      () => undefined,
    )
    return () => animation.cancel()
  }, [])

  useLayoutEffect(() => {
    if (!caption) return
    const timer = setTimeout(() => setCaption(false), LOCK_IN_CAPTION_MS)
    return () => clearTimeout(timer)
  }, [caption])

  return (
    <>
      {fading && (
        <div
          ref={scrimRef}
          aria-hidden="true"
          data-testid="lock-in-scrim"
          style={{ position: 'absolute', inset: 0, background: color.surfaceScrim }}
        />
      )}
      {caption && (
        <p
          role="status"
          data-testid="lock-in-caption"
          style={{
            position: 'absolute',
            bottom: space.xxl,
            left: '50%',
            transform: 'translateX(-50%)',
            margin: 0,
            padding: `${space.sm} ${space.lg}`,
            borderRadius: space.md,
            background: color.surfaceHud,
            color: color.textPrimary,
            fontFamily: type.fontBody,
            fontSize: type.tvBody,
            whiteSpace: 'nowrap',
          }}
        >
          {copy.calibrate.lockedCaption}
        </p>
      )}
    </>
  )
}
