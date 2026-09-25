import { useEffect, useSyncExternalStore } from 'react'
import { useControlStore } from '../app/controlStore'
import { useGameStore } from '../app/gameStore'
import { PORTRAIT_QUERY } from '../app/orientation'
import { color, space, type } from '../styles/tokens'
import { copy } from './copy'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(PORTRAIT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function isPortrait(): boolean {
  return window.matchMedia(PORTRAIT_QUERY).matches
}

/** A phone turning from landscape to portrait. Inherits `currentColor`. */
function RotateIcon() {
  return (
    <svg
      viewBox="0 0 96 96"
      width={96}
      height={96}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Portrait phone, dimmed: where the player is now. */}
      <rect x="14" y="8" width="32" height="56" rx="5" opacity={0.45} />
      {/* Landscape phone: where it should be. */}
      <rect x="30" y="52" width="58" height="32" rx="5" />
      <line x1="80" y1="62" x2="80" y2="74" />
      {/* Turn arrow. */}
      <path d="M58 14 A24 24 0 0 1 80 38" />
      <path d="M72 36 L80 40 L86 32" />
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

  if (!portrait) return null

  return (
    <div
      role="alertdialog"
      aria-label={copy.orientation.title}
      data-testid="orientation-prompt"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.lg,
        padding: space.xl,
        textAlign: 'center',
        background: color.surfaceScrim,
        color: color.textPrimary,
      }}
    >
      <RotateIcon />
      <h2
        style={{
          fontFamily: type.fontDisplay,
          fontWeight: type.weightDisplay,
          fontSize: type.tvTitle,
          margin: 0,
        }}
      >
        {copy.orientation.title}
      </h2>
      <p style={{ fontSize: type.tvBody, margin: 0, color: color.textMuted }}>
        {copy.orientation.body}
      </p>
    </div>
  )
}
