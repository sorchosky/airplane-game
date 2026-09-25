import { color, space, type } from '../../styles/tokens'
import { useGameStore } from '../gameStore'
import { isKeyboardInputMode } from '../urlFlags'

// Simple placeholder overlay. #18 wires gesture-driven pause/resume timing
// and #28 adds the full navigable menu; here Esc (keyboard mode) or a tap
// resumes.
export function PausedOverlay() {
  const resume = useGameStore((s) => s.resume)
  const keyboard = isKeyboardInputMode()

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
        color: color.textOnDark,
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: type.tvTitle, margin: 0 }}>Paused</p>
      {keyboard && (
        <button
          type="button"
          onClick={resume}
          style={{
            fontSize: type.tvBody,
            minHeight: 64,
            minWidth: 200,
            padding: `${space.md} ${space.xl}`,
            borderRadius: space.md,
            border: 'none',
            background: color.accent,
            color: color.textPrimary,
            cursor: 'pointer',
          }}
        >
          Resume
        </button>
      )}
    </div>
  )
}
