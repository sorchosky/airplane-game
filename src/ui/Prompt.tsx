import { useState } from 'react'
import type { ControlPrompt } from '../app/controlStateMachine'
import { color, space, type } from '../styles/tokens'
import { copy } from './copy'

const COPY: Record<Exclude<ControlPrompt, null>, string> = {
  'spread-arms': copy.hud.spreadArms,
  'step-into-view': copy.hud.stepIntoView,
}

const FADE_MS = 200

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Outstretched-arms glyph: a stick figure with level wings. Inherits `currentColor`. */
function WingIcon() {
  return (
    <svg
      viewBox="0 0 64 32"
      width={64}
      height={32}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="32" cy="7" r="4" />
      <path d="M4 15 L32 13 L60 15" />
      <path d="M32 13 L32 24 M32 24 L26 31 M32 24 L38 31" />
    </svg>
  )
}

interface PromptProps {
  prompt: ControlPrompt
}

/**
 * Centered HUD prompt. Stays mounted and fades between shown and hidden (instantly with
 * `prefers-reduced-motion`), keeping the last text on screen while it fades out.
 */
export function Prompt({ prompt }: PromptProps) {
  // The last non-null prompt, so the text doesn't vanish before the fade-out finishes.
  const [displayed, setDisplayed] = useState<Exclude<ControlPrompt, null>>('spread-arms')
  if (prompt && prompt !== displayed) setDisplayed(prompt)
  const shown = prompt !== null

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="hud-prompt"
      data-prompt={prompt ?? 'none'}
      style={{
        position: 'absolute',
        // Horizontally centered, in the lower third so it doesn't cover the plane (screen center).
        top: '70%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        alignItems: 'center',
        gap: space.md,
        padding: `${space.md} ${space.xl}`,
        borderRadius: space.md,
        background: color.surfaceHud,
        color: color.textPrimary,
        fontFamily: type.fontBody,
        fontSize: type.tvBody,
        whiteSpace: 'nowrap',
        opacity: shown ? 1 : 0,
        transition: prefersReducedMotion() ? 'none' : `opacity ${FADE_MS}ms ease-out`,
      }}
    >
      {displayed === 'spread-arms' && <WingIcon />}
      <span>{COPY[displayed]}</span>
    </div>
  )
}
