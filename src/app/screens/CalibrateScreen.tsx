import { usePoseStore, type PoseModelStatus } from '../../pose/poseStore'
import { CameraPreview } from '../../ui/CameraPreview'
import { color, space, type } from '../../styles/tokens'

const MODEL_STATUS_COPY: Partial<Record<PoseModelStatus, string>> = {
  loading: 'Getting motion tracking ready…',
  error: "Motion tracking didn't load. Check your connection and reload the page.",
}

// Placeholder. #17 replaces this with the real hands-free calibration flow
// (distance check, T-pose hold, guidance states).
export function CalibrateScreen() {
  const modelStatus = usePoseStore((s) => s.modelStatus)
  const statusCopy = MODEL_STATUS_COPY[modelStatus]

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.lg,
        height: '100%',
        width: '100%',
        padding: space.xl,
        color: color.textPrimary,
        background: color.surfaceHud,
        textAlign: 'center',
      }}
    >
      <CameraPreview />
      <p style={{ fontSize: type.tvBody, margin: 0, maxWidth: '40ch' }}>
        Step back so your whole upper body is visible.
      </p>
      {statusCopy && (
        <p
          role="status"
          data-testid="pose-model-status"
          style={{ fontSize: type.tvBody, margin: 0, maxWidth: '40ch', color: color.textMuted }}
        >
          {statusCopy}
        </p>
      )}
    </div>
  )
}
