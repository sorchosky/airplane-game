import { color, space, type } from '../../styles/tokens'
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
        color: color.textOnDark,
        background: color.textPrimary,
      }}
    >
      <p style={{ fontSize: type.tvBody, margin: 0, maxWidth: '40ch' }}>
        {errorMessage ?? 'Something went wrong. Please try again.'}
      </p>
      <button
        type="button"
        onClick={retry}
        style={{
          fontSize: type.tvTitle,
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
        Retry
      </button>
    </div>
  )
}
