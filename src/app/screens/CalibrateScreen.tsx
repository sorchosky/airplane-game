import { CameraPreview } from '../../ui/CameraPreview'
import { color, space, type } from '../../styles/tokens'

// Placeholder. #17 replaces this with the real hands-free calibration flow
// (distance check, T-pose hold, guidance states).
export function CalibrateScreen() {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
    </div>
  )
}
