import { useCallback, useState } from 'react'
import { color, space, type } from '../../styles/tokens'
import { useGameStore } from '../gameStore'
import { isKeyboardInputMode } from '../urlFlags'
import { acquireWakeLock } from '../wakeLock'

export function TitleScreen() {
  const startPermission = useGameStore((s) => s.startPermission)
  const permissionGranted = useGameStore((s) => s.permissionGranted)
  const permissionDenied = useGameStore((s) => s.permissionDenied)
  const skipToFlying = useGameStore((s) => s.skipToFlying)
  const [requesting, setRequesting] = useState(false)

  const handleStart = useCallback(() => {
    void acquireWakeLock()

    if (isKeyboardInputMode()) {
      skipToFlying()
      return
    }

    setRequesting(true)
    startPermission()

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' } })
      .then((stream) => {
        for (const track of stream.getTracks()) track.stop()
        permissionGranted()
      })
      .catch(() => {
        permissionDenied(
          'We need your camera to see you fly. Check your browser settings and try again.',
        )
      })
      .finally(() => setRequesting(false))
  }, [permissionDenied, permissionGranted, skipToFlying, startPermission])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.lg,
        height: '100%',
        width: '100%',
        textAlign: 'center',
        padding: space.xl,
        color: color.textPrimary,
        background: `linear-gradient(180deg, ${color.skyZenith}, ${color.skyHorizon})`,
      }}
    >
      {/* Title and tagline sit on a surface-hud plate rather than directly on the sky
          gradient: text-primary only clears WCAG AA near the top of the gradient
          (skyZenith), not toward skyHorizon — see docs/art-direction.md's contrast
          table. A solid plate under the wordmark also reads as a period-appropriate
          mid-century poster device. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: space.md,
          background: color.surfaceHud,
          borderRadius: space.md,
          padding: `${space.lg} ${space.xl}`,
        }}
      >
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
          Skyborne
        </h1>
        <p style={{ fontSize: type.tvBody, margin: 0, maxWidth: '40ch' }}>
          Prop up your phone, spread your arms, and fly.
        </p>
      </div>
      <button
        type="button"
        onClick={handleStart}
        disabled={requesting}
        style={{
          fontFamily: type.fontBody,
          fontWeight: type.weightButton,
          fontSize: type.tvTitle,
          minHeight: 64,
          minWidth: 240,
          padding: `${space.md} ${space.xl}`,
          borderRadius: space.md,
          border: `2px solid ${color.accent}`,
          background: color.surfaceHud,
          color: color.textPrimary,
          cursor: requesting ? 'default' : 'pointer',
          opacity: requesting ? 0.7 : 1,
        }}
      >
        {requesting ? 'Starting…' : 'Start'}
      </button>
    </div>
  )
}
