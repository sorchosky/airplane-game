import { getInputSourceFromUrl } from '../../input/source'
import { usePoseStore } from '../../pose/poseStore'
import { color, space, type } from '../../styles/tokens'
import { useControlStore } from '../controlStore'

// Hands-free pause (#18): arms out for 1 s starts a 3-2-1 countdown, then flying resumes. In
// keyboard mode Esc (or the dev Resume button) does the same. #28 adds the full pause menu.
export function PausedOverlay() {
  const countdown = useControlStore((s) => s.view.countdown)
  const togglePause = useControlStore((s) => s.togglePause)
  const personInFrame = usePoseStore((s) => s.frame !== null)
  const keyboard = getInputSourceFromUrl() === 'keyboard'

  const hint = keyboard
    ? 'Press Esc to continue'
    : personInFrame
      ? 'spread your arms to continue'
      : 'step into view to continue'

  return (
    <div
      role="dialog"
      aria-label="Paused"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.lg,
        background: color.surfaceHud,
        color: color.textPrimary,
        textAlign: 'center',
      }}
    >
      {countdown !== null ? (
        <p
          data-testid="resume-countdown"
          aria-live="assertive"
          style={{
            fontFamily: type.fontDisplay,
            fontWeight: type.weightDisplay,
            fontSize: type.tvDisplay,
            margin: 0,
          }}
        >
          {countdown}
        </p>
      ) : (
        <p style={{ fontSize: type.tvTitle, margin: 0 }}>
          <span style={{ fontFamily: type.fontDisplay, fontWeight: type.weightDisplay }}>
            Paused
          </span>
          {keyboard ? null : ` · ${hint}`}
        </p>
      )}
      {keyboard && countdown === null && (
        <>
          <p style={{ fontSize: type.tvBody, margin: 0, color: color.textMuted }}>{hint}</p>
          <button
            type="button"
            onClick={togglePause}
            style={{
              fontWeight: type.weightButton,
              fontSize: type.tvBody,
              minHeight: 64,
              minWidth: 200,
              padding: `${space.md} ${space.xl}`,
              borderRadius: space.md,
              border: `2px solid ${color.accent}`,
              background: color.surfaceHud,
              color: color.textPrimary,
              cursor: 'pointer',
            }}
          >
            Resume
          </button>
        </>
      )}
    </div>
  )
}
