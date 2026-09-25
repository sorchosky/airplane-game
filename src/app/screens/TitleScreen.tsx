import { useCallback } from 'react'
import { color, space, type } from '../../styles/tokens'
import { useGameStore } from '../gameStore'
import { isKeyboardInputMode } from '../urlFlags'
import { acquireWakeLock } from '../wakeLock'

export function TitleScreen() {
  const startPermission = useGameStore((s) => s.startPermission)
  const permissionGranted = useGameStore((s) => s.permissionGranted)
  const skipToFlying = useGameStore((s) => s.skipToFlying)

  const handleStart = useCallback(() => {
    void acquireWakeLock()

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
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.lg,
        height: '100%',
        width: '100%',
        textAlign: 'center',
        padding: space.xl,
        color: color.textOnDark,
        background: `linear-gradient(180deg, ${color.sky}, ${color.ground})`,
      }}
    >
      <h1 style={{ fontSize: type.tvDisplay, margin: 0 }}>Skyborne</h1>
      <p style={{ fontSize: type.tvBody, margin: 0, maxWidth: '40ch' }}>
        Prop up your phone, spread your arms, and fly.
      </p>
      <button
        type="button"
        onClick={handleStart}
        style={{
          fontSize: type.tvTitle,
          minHeight: 64,
          minWidth: 240,
          padding: `${space.md} ${space.xl}`,
          borderRadius: space.md,
          border: 'none',
          background: color.accent,
          color: color.textPrimary,
          cursor: 'pointer',
        }}
      >
        Start
      </button>
    </div>
  )
}
