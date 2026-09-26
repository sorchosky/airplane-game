import { type CSSProperties, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { resumeAudioEngine } from '../../audio/audioEngine'
import { color, radius, space, type } from '../../styles/tokens'
import { copy } from '../../ui/copy'
import { TitleSky } from '../../ui/TitleSky'
import { useGameStore } from '../gameStore'
import { tryLockLandscape } from '../orientation'
import { isKeyboardInputMode } from '../urlFlags'
import { acquireWakeLock } from '../wakeLock'
import {
  BAND_BLUR_PX,
  BAND_WIDTH_VW,
  START_EASING,
  TITLE_INTRO,
  bandKeyframes,
  revealKeyframes,
  shouldPlayIntro,
  startBeginsAt,
  startKeyframes,
} from './titleIntro'

/** Module scope, so the intro plays once per page load (see `shouldPlayIntro`). */
let introPlayed = false

/** The wordmark's shadow sits this far below it (Figma: 8 px at 48 px type). */
const HERO_SHADOW_OFFSET = '0.1667em'
/** Figma: the shadow is `title-text-shadow` at 20%. */
const HERO_SHADOW_OPACITY = 0.2

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

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

  // Decided once per mount, before the first paint, so a skipped intro never flashes.
  const [playIntro] = useState(() => shouldPlayIntro(introPlayed, prefersReducedMotion()))
  const revealRef = useRef<HTMLDivElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    const reveal = revealRef.current
    const band = bandRef.current
    const start = startRef.current
    if (!playIntro || !reveal || !band || !start) return
    introPlayed = true

    const sweep: KeyframeAnimationOptions = {
      duration: TITLE_INTRO.sweep,
      delay: TITLE_INTRO.skyHold,
      easing: 'linear',
      fill: 'both',
    }
    const animations = [
      reveal.animate(revealKeyframes(), sweep),
      band.animate(bandKeyframes(), sweep),
      start.animate(startKeyframes(), {
        duration: TITLE_INTRO.startDuration,
        delay: startBeginsAt(),
        easing: START_EASING,
        fill: 'backwards',
      }),
    ]
    // The reveal's end state (clip past the right edge) equals no clip; drop it so the title
    // isn't left carrying a clip-path.
    const [revealAnimation] = animations
    revealAnimation?.finished.then(
      () => revealAnimation.cancel(),
      () => undefined,
    )
    return () => animations.forEach((a) => a.cancel())
  }, [playIntro])

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        color: color.titleText,
      }}
    >
      <TitleSky />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Full-width row so the reveal clip and the band share viewport coordinates. */}
        <div ref={revealRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <h1
            style={{
              display: 'grid',
              margin: 0,
              fontFamily: type.fontDisplay,
              fontWeight: type.weightHero,
              fontSize: type.tvHero,
              lineHeight: 1,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                ...heroLayer(type.trackingHeroShadow),
                color: color.titleTextShadow,
                opacity: HERO_SHADOW_OPACITY,
                transform: `translateY(${HERO_SHADOW_OFFSET})`,
              }}
            >
              {copy.title.name}
            </span>
            <span style={heroLayer(type.trackingHero)}>{copy.title.name}</span>
          </h1>
        </div>
      </div>
      {/* Frame 07: the title sits dead center and Start hangs below it, rather than the two being
        centered as a group. */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          paddingTop: `calc(${type.tvHero} / 2 + ${space.lg})`,
        }}
      >
        <button
          ref={startRef}
          type="button"
          onClick={handleStart}
          style={{
            minHeight: 64,
            padding: `${space.md} ${space.xl}`,
            borderRadius: radius.sharp,
            border: `2px solid ${color.titleStartBorder}`,
            background: 'transparent',
            color: color.titleText,
            fontFamily: type.fontBody,
            fontWeight: type.weightStart,
            fontSize: type.tvBody,
            lineHeight: 1,
            letterSpacing: type.trackingStart,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {/* Letter-spacing also trails the last letter; pull it back so the label centers. */}
          <span style={{ marginRight: `calc(-1 * ${type.trackingStart})` }}>
            {copy.title.start}
          </span>
        </button>
      </div>
      {playIntro && (
        <div
          ref={bandRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${BAND_WIDTH_VW}vw`,
            backdropFilter: `blur(${BAND_BLUR_PX}px)`,
            WebkitBackdropFilter: `blur(${BAND_BLUR_PX}px)`,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}

/** One of the wordmark's two stacked layers (the text and its shadow share a grid cell). */
function heroLayer(tracking: string): CSSProperties {
  return {
    gridArea: '1 / 1',
    justifySelf: 'center',
    letterSpacing: tracking,
    // Letter-spacing also trails the last letter; indent by the same amount so the word centers.
    paddingLeft: tracking,
  }
}
