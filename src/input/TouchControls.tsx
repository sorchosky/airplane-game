import { useRef } from 'react'
import { color, space } from '../styles/tokens'
import { touchTargets } from './touchTargets'

/** Half-width/height, in px, of a full drag swing to reach ±1 on an axis. */
const DRAG_RANGE_PX = 80

interface DragState {
  pointerId: number | null
  originX: number
  originY: number
}

function useDragZone(axis: 'roll' | 'pitch') {
  const dragRef = useRef<DragState>({ pointerId: null, originX: 0, originY: 0 })

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return
    const { originX, originY } = dragRef.current
    const delta = axis === 'roll' ? event.clientX - originX : -(event.clientY - originY)
    const raw = Math.min(1, Math.max(-1, delta / DRAG_RANGE_PX))
    touchTargets[axis] = raw
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return
    dragRef.current.pointerId = null
    touchTargets[axis] = 0
  }

  return { onPointerDown, onPointerMove, onPointerUp }
}

/**
 * Two-zone drag fallback for phones without a keyboard. Only rendered behind `?input=keyboard`.
 * Writes drag targets into `touchTargets`, which `keyboardSource`'s single per-frame tick reads
 * and ramps toward — this component never writes to the input store directly.
 */
export function TouchControls() {
  const roll = useDragZone('roll')
  const pitch = useDragZone('pitch')

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'none',
        touchAction: 'none',
      }}
    >
      <div style={{ flex: 1, display: 'flex' }}>
        <div
          onPointerDown={roll.onPointerDown}
          onPointerMove={roll.onPointerMove}
          onPointerUp={roll.onPointerUp}
          onPointerCancel={roll.onPointerUp}
          style={{ flex: 1, pointerEvents: 'auto' }}
        />
        <div
          onPointerDown={pitch.onPointerDown}
          onPointerMove={pitch.onPointerMove}
          onPointerUp={pitch.onPointerUp}
          onPointerCancel={pitch.onPointerUp}
          style={{ flex: 1, pointerEvents: 'auto' }}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          touchTargets.toggleActive = true
        }}
        style={{
          margin: space.md,
          padding: `${space.sm} ${space.md}`,
          background: color.surfaceHud,
          color: color.textOnDark,
          border: 'none',
          borderRadius: space.xs,
          pointerEvents: 'auto',
        }}
      >
        Toggle active
      </button>
    </div>
  )
}
