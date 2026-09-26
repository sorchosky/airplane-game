import { color, radius, space, type } from '../styles/tokens'
import { copy } from './copy'
import { TitleSky } from './TitleSky'

/** Camera glyph, drawn in the text color at the copy's cap height scale. */
function CameraIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      width={space.xxxl}
      height={space.xxxl}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <g fill="none" stroke={color.textPrimary} strokeWidth={3} strokeLinejoin="round">
        <path d="M6 16h8l4-6h12l4 6h8v22H6z" />
        <circle cx={24} cy={26} r={7} />
      </g>
    </svg>
  )
}

interface CameraAskProps {
  /** The player said no: show how to allow it, and Try again. */
  denied?: boolean
  onRetry?: () => void
}

/**
 * Storyboard frame 01: one frame, over the title sky, while the browser's camera prompt is open on
 * top of it; and the same frame if the camera is refused. The player is still at the phone here,
 * so the denied state may take a tap. Never shows raw error text.
 */
export function CameraAsk({ denied = false, onRetry }: CameraAskProps) {
  return (
    <div
      data-testid="camera-ask"
      data-denied={denied}
      style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}
    >
      <TitleSky />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: space.xl,
        }}
      >
        <div
          role={denied ? 'alert' : 'status'}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: space.lg,
            maxWidth: '36ch',
            padding: `${space.xl} ${space.xxl}`,
            borderRadius: space.md,
            background: color.surfaceHud,
            color: color.textPrimary,
            fontFamily: type.fontBody,
            fontSize: type.tvBody,
            textAlign: 'center',
          }}
        >
          <CameraIcon />
          <p style={{ margin: 0 }}>{denied ? copy.cameraAsk.denied : copy.cameraAsk.body}</p>
          {denied && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                minHeight: 64,
                padding: `${space.md} ${space.xl}`,
                borderRadius: radius.sharp,
                border: `2px solid ${color.accent}`,
                background: 'transparent',
                color: color.textPrimary,
                fontFamily: type.fontBody,
                fontWeight: type.weightButton,
                fontSize: type.tvBody,
                cursor: 'pointer',
              }}
            >
              {copy.cameraAsk.retry}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
