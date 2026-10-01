import { color, effect, radius, space, type } from '../styles/tokens'
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
      <TitleSky introStart={null} />
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
            border: `1px solid ${color.line}`,
            borderRadius: radius.sharp,
            background: color.surfaceHud,
            backdropFilter: effect.hudBlur,
            textShadow: effect.textGlow,
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
                border: `1px solid ${color.accent}`,
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

/**
 * The camera ask in the Position beat (#160): two lines of copy under the calibration frame's
 * guidance slot while the browser's prompt is up. The frame, target and world are already on
 * screen, so there is no plate and no sky of its own.
 */
export function CameraAskCaption() {
  return (
    <div
      role="status"
      data-testid="camera-ask"
      data-denied="false"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: space.xs,
        padding: `${space.sm} ${space.lg}`,
        borderBottom: `1px solid ${color.line}`,
        textShadow: effect.textGlow,
        color: color.textPrimary,
        fontFamily: type.fontBody,
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, fontSize: type.tvTitle, whiteSpace: 'nowrap' }}>
        {copy.cameraAsk.body}
      </p>
      <p style={{ margin: 0, fontSize: type.tvBody, color: color.textMuted }}>
        {copy.cameraAsk.privacy}
      </p>
    </div>
  )
}
