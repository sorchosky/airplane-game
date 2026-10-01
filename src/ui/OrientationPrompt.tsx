import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useControlStore } from '../app/controlStore'
import { useGameStore } from '../app/gameStore'
import { PORTRAIT_QUERY } from '../app/orientation'
import { color, effect, motion, size, space, type } from '../styles/tokens'
import { copy } from './copy'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(PORTRAIT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function isPortrait(): boolean {
  return window.matchMedia(PORTRAIT_QUERY).matches
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * A phone outline turning 90° clockwise into landscape, holding, and looping. Inherits
 * `currentColor`. Reduced motion shows the landscape end state.
 */
function RotateIcon() {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia(REDUCED_MOTION_QUERY).matches) return
    const turn = motion.rotateCueTurnMs
    const total = turn + motion.rotateCueHoldMs
    const animation = el.animate(
      [
        { transform: 'rotate(0deg)', offset: 0, easing: 'ease-in-out' },
        { transform: 'rotate(90deg)', offset: turn / total },
        { transform: 'rotate(90deg)', offset: 1 },
      ],
      { duration: total, iterations: Infinity },
    )
    return () => animation.cancel()
  }, [])

  return (
    <svg
      ref={ref}
      viewBox="0 0 96 96"
      width={96}
      height={96}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        strokeWidth: size.glyphStroke,
        transform: 'rotate(90deg)',
        filter: effect.ringGlow,
      }}
    >
      <rect x="32" y="12" width="32" height="72" rx="6" vectorEffect="non-scaling-stroke" />
      <line x1="42" y1="76" x2="54" y2="76" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * Full-screen "turn your phone sideways" prompt while the viewport is portrait. Pauses the game
 * if it was flying; the player resumes from the pause menu once the phone is back in landscape.
 */
export function OrientationPrompt() {
  const portrait = useSyncExternalStore(subscribe, isPortrait)
  const flying = useGameStore((s) => s.state === 'flying')

  // Keyed on `flying` too, so a resume that lands while still portrait pauses straight away.
  useEffect(() => {
    if (portrait && flying) useControlStore.getState().forcePause()
  }, [portrait, flying])

  // Paint the page behind the prompt (and the browser chrome colour) to match the scrim, so the
  // iOS status bar area has no stray strip.
  useEffect(() => {
    if (!portrait) return
    const root = document.documentElement
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const previous = meta?.content
    root.setAttribute('data-orientation-prompt', '')
    if (meta) meta.content = color.orientationBackdrop
    return () => {
      root.removeAttribute('data-orientation-prompt')
      if (meta && previous !== undefined) meta.content = previous
    }
  }, [portrait])

  if (!portrait) return null

  return (
    <div
      role="alertdialog"
      aria-label={copy.orientation.title}
      data-testid="orientation-prompt"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.lg,
        padding: space.xl,
        textAlign: 'center',
        background: color.orientationScrim,
        backdropFilter: effect.tintBlur,
        WebkitBackdropFilter: effect.tintBlur,
        color: color.textPrimary,
        textShadow: effect.textGlow,
      }}
    >
      <RotateIcon />
      <h2
        style={{
          fontFamily: type.fontDisplay,
          fontWeight: type.weightDisplay,
          fontSize: type.tvTitle,
          margin: 0,
          maxWidth: '20ch',
          textWrap: 'balance',
        }}
      >
        {copy.orientation.title}
      </h2>
    </div>
  )
}
