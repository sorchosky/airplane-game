import { useEffect, useRef, useState } from 'react'
import { color } from '../styles/tokens'
import { joystickVector, type JoystickVector } from './touchJoystick'
import { touchTargets } from './touchTargets'

// The knob reaches the base's inner edge at full deflection (80 px radius − 24 px knob radius).
const BASE_DIAMETER_PX = 160
const KNOB_DIAMETER_PX = 48

interface StickState extends JoystickVector {
  pointerId: number
  originX: number
  originY: number
}

/**
 * A floating touch joystick. Its base appears wherever the player puts a thumb, follows that
 * pointer until release, and then disappears. Holding the stick engages manual control; lifting
 * the thumb returns the plane to autopilot.
 */
export function TouchControls() {
  const [stick, setStick] = useState<StickState | null>(null)
  const stickRef = useRef<StickState | null>(null)

  const updateStick = (next: StickState | null) => {
    stickRef.current = next
    setStick(next)
  }

  const release = (pointerId?: number) => {
    const current = stickRef.current
    if (!current || (pointerId !== undefined && current.pointerId !== pointerId)) return
    touchTargets.roll = 0
    touchTargets.pitch = 0
    touchTargets.active = false
    updateStick(null)
  }

  useEffect(
    () => () => {
      touchTargets.roll = 0
      touchTargets.pitch = 0
      touchTargets.active = false
    },
    [],
  )

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stickRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    touchTargets.roll = 0
    touchTargets.pitch = 0
    touchTargets.active = true
    updateStick({
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      x: 0,
      y: 0,
      roll: 0,
      pitch: 0,
    })
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = stickRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const vector = joystickVector(event.clientX - current.originX, event.clientY - current.originY)
    touchTargets.roll = vector.roll
    touchTargets.pitch = vector.pitch
    updateStick({ ...current, ...vector })
  }

  return (
    <div
      data-testid="touch-joystick-zone"
      aria-label="Flight joystick"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => release(event.pointerId)}
      onPointerCancel={(event) => release(event.pointerId)}
      onLostPointerCapture={(event) => release(event.pointerId)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {stick && (
        <div
          data-testid="touch-joystick"
          style={{
            position: 'absolute',
            left: stick.originX,
            top: stick.originY,
            width: BASE_DIAMETER_PX,
            height: BASE_DIAMETER_PX,
            border: `2px solid ${color.line}`,
            borderRadius: '50%',
            background: color.surfaceHud,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: KNOB_DIAMETER_PX,
              height: KNOB_DIAMETER_PX,
              borderRadius: '50%',
              background: color.controlActive,
              boxShadow: `0 0 0 2px ${color.line}`,
              transform: `translate(calc(-50% + ${stick.x}px), calc(-50% + ${stick.y}px))`,
            }}
          />
        </div>
      )}
    </div>
  )
}
