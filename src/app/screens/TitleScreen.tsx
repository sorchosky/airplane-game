import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { playTitleSwell, resumeAudioEngine, setMuted } from '../../audio/audioEngine'
import { useAudioStore } from '../../audio/audioStore'
import { color, type } from '../../styles/tokens'
import { selectedInputSource, useControlModeStore } from '../controlModeStore'
import { useGameStore } from '../gameStore'
import { tryLockLandscape } from '../orientation'
import { useWorldStore } from '../worldStore'
import { acquireWakeLock } from '../wakeLock'
import {
  INTRO_EASING,
  TITLE_INTRO,
  fadeKeyframes,
  ruleBeginsAt,
  ruleKeyframes,
  shouldPlayIntro,
  startBeginsAt,
  startKeyframes,
  swellTiming,
  wordmarkKeyframes,
} from './titleIntro'
import { useTitleHandoffStore } from './titleHandoff'
import {
  Masthead,
  MastheadRule,
  StartButton,
  StartSlot,
  TitleScrim,
  TitleWordmark,
} from './TitleText'

/** Module scope, so the intro plays once per page load (see `shouldPlayIntro`). */
let introPlayed = false

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function TitleScreen() {
  const startPermission = useGameStore((s) => s.startPermission)
  const startSelection = useGameStore((s) => s.startSelection)
  const permissionGranted = useGameStore((s) => s.permissionGranted)
  const skipToFlying = useGameStore((s) => s.skipToFlying)

  const handleStart = useCallback(() => {
    void acquireWakeLock()
    tryLockLandscape()
    // AudioContext creation/resume must happen inside this click handler (autoplay policy).
    void resumeAudioEngine()

    // The camera sinks through the cirrus into whatever mounts next (see `TitleHandoff`). Only
    // while the poster is still up: once the live world has taken over there is no sky to sink.
    if (!prefersReducedMotion()) {
      const still = useWorldStore.getState().posterSnapshot?.() ?? null
      if (still) useTitleHandoffStore.getState().begin(still)
    }

    const source = selectedInputSource()
    if (useControlModeStore.getState().inputOverride === null) {
      startSelection()
      return
    }
    if (source === 'keyboard') {
      skipToFlying()
      return
    }

    // The real camera permission prompt happens once we're on the calibrate
    // screen (the camera service starts on entering `calibrate`); this just
    // advances past the transient `permission` state. A denial there routes
    // back to `error` via the same `permissionDenied` action.
    startPermission()
    permissionGranted()
  }, [permissionGranted, skipToFlying, startPermission, startSelection])

  // Decided once per mount, before the first paint, so a skipped intro never flashes.
  const [playIntro] = useState(() => shouldPlayIntro(introPlayed, prefersReducedMotion()))
  const fadeRef = useRef<HTMLDivElement>(null)
  const wordmarkRef = useRef<HTMLHeadingElement>(null)
  const ruleRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const fade = fadeRef.current
    const wordmark = wordmarkRef.current
    const rule = ruleRef.current
    const start = startRef.current
    if (!playIntro || !fade || !wordmark || !rule || !start) return
    introPlayed = true

    // `backwards` holds each element at its first frame until its turn; once it has played, the
    // element is back at its static style, so nothing stays composited.
    const step = (duration: number, delay: number): KeyframeAnimationOptions => ({
      duration,
      delay,
      easing: INTRO_EASING,
      fill: 'backwards',
    })
    const animations = [
      fade.animate(fadeKeyframes(), { ...step(TITLE_INTRO.fade, 0), fill: 'both' }),
      wordmark.animate(
        wordmarkKeyframes(type.trackingDisplay),
        step(TITLE_INTRO.wordmark, TITLE_INTRO.wordmarkStart),
      ),
      rule.animate(ruleKeyframes(), step(TITLE_INTRO.rule, ruleBeginsAt())),
      start.animate(startKeyframes(), step(TITLE_INTRO.startDuration, startBeginsAt())),
    ]
    // The fade ends invisible, so drop it rather than leave a full-screen layer composited.
    const [fadeAnimation] = animations
    fadeAnimation?.finished.then(
      () => fadeAnimation.cancel(),
      () => undefined,
    )

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
      <TitleScrim />
      <Masthead>
        <TitleWordmark ref={wordmarkRef} />
        <MastheadRule ref={ruleRef} />
        <StartSlot ref={startRef}>
          <StartButton onClick={handleStart} />
        </StartSlot>
      </Masthead>
      {playIntro && (
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
      )}
    </div>
  )
}
