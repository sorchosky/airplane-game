import { color, space, type } from '../../styles/tokens'
import { copy } from '../../ui/copy'
import { useGameStore } from '../gameStore'

export function ErrorScreen() {
  const errorMessage = useGameStore((s) => s.errorMessage)
  const retry = useGameStore((s) => s.retry)

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
        background: color.surfaceHud,
      }}
    >
      <p style={{ fontSize: type.tvBody, margin: 0, maxWidth: '40ch' }}>
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
          borderRadius: space.md,
          border: `2px solid ${color.accent}`,
          background: color.surfaceHud,
          color: color.textPrimary,
          cursor: 'pointer',
        }}
      >
        {copy.error.retry}
      </button>
    </div>
  )
}
