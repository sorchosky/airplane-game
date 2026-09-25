import type { Ref } from 'react'
import { color, size } from '../styles/tokens'

/** Ring radius and circumference in viewBox units. The loop drives `strokeDashoffset` from 0..1. */
const RING_RADIUS = 74
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface CalibrationFigureProps {
  /** Arms-out pose (spread your arms / hold) vs arms-down (step into view). */
  armsOut: boolean
  /** Whether the hold is running: the figure turns the active color and the ring shows. */
  holding: boolean
  /** Progress ring arc. The screen writes its `strokeDashoffset` directly every frame. */
  ringRef: Ref<SVGCircleElement>
}

/** Simple stick silhouette showing the pose to strike, inside a hold-progress ring. */
export function CalibrationFigure({ armsOut, holding, ringRef }: CalibrationFigureProps) {
  const stroke = holding ? color.controlActive : color.textMuted

  return (
    <svg
      viewBox="0 0 160 160"
      width={size.calibrationFigure}
      height={size.calibrationFigure}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx={80}
        cy={80}
        r={RING_RADIUS}
        fill="none"
        stroke={color.controlInactive}
        strokeWidth={6}
        opacity={holding ? 0.5 : 0}
      />
      <circle
        ref={ringRef}
        cx={80}
        cy={80}
        r={RING_RADIUS}
        fill="none"
        stroke={color.controlActive}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE}
        transform="rotate(-90 80 80)"
        opacity={holding ? 1 : 0}
      />
      <g stroke={stroke} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx={80} cy={42} r={11} fill={stroke} stroke="none" />
        <line x1={80} y1={58} x2={80} y2={96} />
        <line x1={80} y1={96} x2={68} y2={124} />
        <line x1={80} y1={96} x2={92} y2={124} />
        {armsOut ? (
          <line x1={34} y1={64} x2={126} y2={64} />
        ) : (
          <polyline points="62,94 72,64 88,64 98,94" />
        )}
      </g>
    </svg>
  )
}
