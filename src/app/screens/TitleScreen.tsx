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
      <h1
        style={{
          fontFamily: type.fontDisplay,
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
      <button
        type="button"
        onClick={handleStart}
        disabled={requesting}
        style={{
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
