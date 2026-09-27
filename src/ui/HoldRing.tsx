import type { Ref } from 'react'
import { color, size } from '../styles/tokens'

/** Ring radius and circumference in viewBox units. The loop drives `strokeDashoffset` from 0..1. */
const RING_RADIUS = 20
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface HoldRingProps {
  /** Progress arc. The calibrate screen writes its `strokeDashoffset` directly every frame. */
  ringRef: Ref<SVGCircleElement>
}

/** Hold-progress ring beside the calibration guidance, shown while the player holds the T-pose. */
export function HoldRing({ ringRef }: HoldRingProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size.holdRing}
      height={size.holdRing}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx={24}
        cy={24}
        r={RING_RADIUS}
        fill="none"
        stroke={color.controlInactive}
        strokeWidth={5}
        opacity={0.5}
      />
      <circle
        ref={ringRef}
        cx={24}
        cy={24}
        r={RING_RADIUS}
        fill="none"
        stroke={color.controlActive}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE}
        transform="rotate(-90 24 24)"
      />
    </svg>
  )
}
