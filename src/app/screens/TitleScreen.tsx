import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { playTitleSwell, resumeAudioEngine, setMuted } from '../../audio/audioEngine'
import { useAudioStore } from '../../audio/audioStore'
import { color } from '../../styles/tokens'
import { TitleSky, type TitleSkyHandle } from '../../ui/TitleSky'
import { useGameStore } from '../gameStore'
import { tryLockLandscape } from '../orientation'
import { isKeyboardInputMode } from '../urlFlags'
import { acquireWakeLock } from '../wakeLock'
import {
  FADE_EASING,
  START_EASING,
  SWEEP_EASING,
  TITLE_INTRO,
  bandKeyframes,
  bandMask,
  fadeKeyframes,
  revealKeyframes,
  shouldPlayIntro,
  startBeginsAt,
  startKeyframes,
  swellTiming,
  BAND_WIDTH_VW,
} from './titleIntro'
import { useTitleHandoffStore } from './titleHandoff'
import { StartButton, StartRow, TitleScrim, TitleWordmark, WordmarkRow } from './TitleText'

/** Module scope, so the intro plays once per page load (see `shouldPlayIntro`). */
let introPlayed = false

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function TitleScreen() {
  const startPermission = useGameStore((s) => s.startPermission)
  const permissionGranted = useGameStore((s) => s.permissionGranted)
  const skipToFlying = useGameStore((s) => s.skipToFlying)
  const skyRef = useRef<TitleSkyHandle>(null)

  const handleStart = useCallback(() => {
    void acquireWakeLock()
    tryLockLandscape()
    // AudioContext creation/resume must happen inside this click handler (autoplay policy).
    void resumeAudioEngine()

    // The camera sinks through the cirrus into whatever mounts next (see `TitleHandoff`).
    if (!prefersReducedMotion()) {
      const still = skyRef.current?.snapshot() ?? null
      if (still) useTitleHandoffStore.getState().begin(still)
    }

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
  const [introStart] = useState(() => (playIntro ? performance.now() : null))
  const fadeRef = useRef<HTMLDivElement>(null)
  const revealRef = useRef<HTMLDivElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    const fade = fadeRef.current
    const reveal = revealRef.current
    const band = bandRef.current
    const start = startRef.current
    if (!playIntro || !fade || !reveal || !band || !start) return
    introPlayed = true

    const sweep: KeyframeAnimationOptions = {
      duration: TITLE_INTRO.sweep,
      delay: TITLE_INTRO.sweepStart,
      easing: SWEEP_EASING,
      fill: 'both',
    }
    const animations = [
      fade.animate(fadeKeyframes(), {
        duration: TITLE_INTRO.fade,
        easing: FADE_EASING,
        fill: 'both',
      }),
      reveal.animate(revealKeyframes(), sweep),
      band.animate(bandKeyframes(), sweep),
      start.animate(startKeyframes(), {
        duration: TITLE_INTRO.startDuration,
        delay: startBeginsAt(),
        easing: START_EASING,
        fill: 'backwards',
      }),
    ]
    // Each of these ends looking exactly like its element's static style (the fade invisible, the
    // title unmasked, the band parked off screen), so drop them once done rather than leave
    // a mask and a backdrop filter composited for the rest of the title's life.
    const [fadeAnimation, revealAnimation, bandAnimation] = animations
    for (const done of [fadeAnimation, revealAnimation, bandAnimation]) {
      done?.finished.then(
        () => done.cancel(),
        () => undefined,
      )
    }

    // Through the cue bus, respecting the saved mute setting (the M toggle).
    setMuted(useAudioStore.getState().muted)
    playTitleSwell(swellTiming())

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
      <TitleSky ref={skyRef} introStart={introStart} />
      <TitleScrim />
      <WordmarkRow>
        {/* Full-width row so the reveal mask and the band share viewport coordinates. The mask
          lives only in the reveal's keyframes, so the settled title carries none. */}
        <div ref={revealRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <TitleWordmark />
        </div>
      </WordmarkRow>
      <StartRow>
        <StartButton ref={startRef} onClick={handleStart} />
      </StartRow>
      {playIntro && (
        <>
          <div
            ref={bandRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${BAND_WIDTH_VW}vw`,
              // Parked off screen until the animation (fill: both) takes over.
              transform: 'translateX(-100vw)',
              maskImage: bandMask(),
              WebkitMaskImage: bandMask(),
              pointerEvents: 'none',
            }}
          />
          <div
            ref={fadeRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: color.titleFade,
              // Held at 1 by the fade (fill: both) until it finishes and is dropped.
              opacity: 0,
              pointerEvents: 'none',
            }}
          />
        </>
      )}
    </div>
  )
}
