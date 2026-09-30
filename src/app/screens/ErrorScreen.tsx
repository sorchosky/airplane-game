import { color, effect, radius, space, type } from '../../styles/tokens'
import { useCameraStore } from '../../pose/cameraService'
import { CameraAsk } from '../../ui/CameraAsk'
import { copy } from '../../ui/copy'
import { useGameStore } from '../gameStore'

export function ErrorScreen() {
  const errorMessage = useGameStore((s) => s.errorMessage)
  const retry = useGameStore((s) => s.retry)
  const cameraDenied = useCameraStore((s) => s.status === 'denied')

  // A refused camera gets the camera-ask frame again, with the settings hint (#63).
  if (cameraDenied) return <CameraAsk denied onRetry={retry} />

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
        padding: space.xl,
        textAlign: 'center',
        color: color.textPrimary,
        background: color.surfaceScrim,
        backdropFilter: effect.scrimBlur,
      }}
    >
      <p
        style={{
          fontSize: type.tvBody,
          margin: 0,
          maxWidth: '40ch',
          padding: space.xl,
          border: `1px solid ${color.line}`,
          borderRadius: radius.sharp,
          background: color.surfaceHud,
          backdropFilter: effect.hudBlur,
        }}
      >
        {errorMessage ?? copy.error.generic}
      </p>
      <button
        type="button"
        onClick={retry}
        style={{
          fontWeight: type.weightButton,
          fontSize: type.tvTitle,
          minHeight: 64,
          minWidth: 200,
          padding: `${space.md} ${space.xl}`,
          borderRadius: radius.sharp,
          border: `1px solid ${color.accent}`,
          background: 'transparent',
          color: color.textPrimary,
          cursor: 'pointer',
        }}
      >
        {copy.error.retry}
      </button>
    </div>
  )
}
