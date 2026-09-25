import { color, space, type } from '../../styles/tokens'
import { copy } from '../../ui/copy'
import { useControlStore } from '../controlStore'
import { PauseMenu } from './PauseMenu'

/**
 * Paused (#18, #28): the pause menu, or the 3-2-1 countdown once Resume is picked. In pose mode,
 * dropping the arms during the countdown cancels it and brings the menu back.
 */
export function PausedOverlay() {
  const countdown = useControlStore((s) => s.view.countdown)

  return (
    <div
      role="dialog"
      aria-label={copy.pause.title}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.lg,
        padding: space.xl,
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
        <PauseMenu />
      )}
    </div>
  )
}
