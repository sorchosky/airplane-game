import { useCallback } from 'react'
import { resumeAudioEngine } from '../../audio/audioEngine'
import { color, space, type } from '../../styles/tokens'
import { copy } from '../../ui/copy'
import { useGameStore } from '../gameStore'
import { tryLockLandscape } from '../orientation'
import { isKeyboardInputMode } from '../urlFlags'
import { acquireWakeLock } from '../wakeLock'

export function TitleScreen() {
  const startPermission = useGameStore((s) => s.startPermission)
  const permissionGranted = useGameStore((s) => s.permissionGranted)
  const skipToFlying = useGameStore((s) => s.skipToFlying)

  const handleStart = useCallback(() => {
    void acquireWakeLock()
    tryLockLandscape()
    // AudioContext creation/resume must happen inside this click handler (autoplay policy).
    void resumeAudioEngine()

    if (isKeyboardInputMode()) {
      skipToFlying()
      return
    }

    // The real camera permission prompt happens once we're on the calibrate
    // screen (the camera service starts on entering `calibrate`); this just
    // advances past the transient `permission` state. A denial there routes
    // back to `error` via the same `permissionDenied` action.
    startPermission()
    permissionGranted()
  }, [permissionGranted, skipToFlying, startPermission])

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        alignContent: 'center',
        gap: space.xxl,
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        padding: space.xl,
        color: color.textPrimary,
        background: `linear-gradient(180deg, ${color.skyZenith}, ${color.skyHorizon})`,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: space.lg,
          textAlign: 'center',
        }}
      >
        {/* No panel behind the title/tagline or button, and no drop shadows, per owner
          request — everything sits directly on the sky gradient. The title is large
          enough (tv-display resolves well above 32px) to clear WCAG's 3:1 large-text
          minimum without help, even mid-gradient, so it carries no shadow at all. The
          tagline is regular-weight body text and needs the full 4.5:1, which the raw
          gradient alone doesn't reliably clear — it keeps a minimal, zero-offset text
          glow (not an offset "drop" shadow) as the smallest legibility assist that
          still works. Known tradeoff either way: see docs/art-direction.md's contrast
          note. */}
        <h1
          style={{
            fontFamily: type.fontDisplay,
            fontWeight: type.weightDisplay,
            fontSize: type.tvDisplay,
            textTransform: 'uppercase',
            letterSpacing: type.trackingDisplay,
            margin: 0,
          }}
        >
          {copy.title.name}
        </h1>
        <p
          style={{
            fontSize: type.tvBody,
            textShadow: `0 0 4px ${color.outline}`,
            margin: 0,
            maxWidth: '40ch',
          }}
        >
          {copy.title.tagline}
        </p>
        <button
          type="button"
          onClick={handleStart}
          style={{
            fontFamily: type.fontDisplay,
            fontWeight: type.weightDisplay,
            fontSize: type.tvTitle,
            textTransform: 'uppercase',
            letterSpacing: type.trackingDisplay,
            minHeight: 64,
            minWidth: 240,
            padding: `${space.md} ${space.xl}`,
            borderRadius: space.md,
            border: `2px solid ${color.textPrimary}`,
            background: 'transparent',
            color: color.textPrimary,
            cursor: 'pointer',
          }}
        >
          {copy.title.start}
        </button>
      </div>
      <HowToPlay />
    </div>
  )
}

/**
 * The three setup steps, on a `surface-hud` plate: unlike the title and tagline, this is several
 * lines of body text, which needs the plate to clear AA (docs/decisions.md, 2026-09-25 art).
 */
function HowToPlay() {
  return (
    <section
      aria-labelledby="how-to-play"
      style={{
        maxWidth: '26ch',
        padding: `${space.lg} ${space.xl}`,
        borderRadius: space.md,
        background: color.surfaceHud,
        fontSize: type.tvBody,
      }}
    >
      <h2
        id="how-to-play"
        style={{
          fontFamily: type.fontDisplay,
          fontWeight: type.weightDisplay,
          fontSize: type.tvBody,
          textTransform: 'uppercase',
          letterSpacing: type.trackingDisplay,
          color: color.textMuted,
          margin: `0 0 ${space.md}`,
        }}
      >
        {copy.title.howToPlay}
      </h2>
      <ol
        style={{
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: space.md,
          margin: 0,
          padding: 0,
        }}
      >
        {copy.title.steps.map((step, i) => (
          <li key={step} style={{ display: 'flex', gap: space.md }}>
            <span
              aria-hidden="true"
              style={{
                fontFamily: type.fontDisplay,
                fontWeight: type.weightDisplay,
                color: color.accent,
              }}
            >
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
