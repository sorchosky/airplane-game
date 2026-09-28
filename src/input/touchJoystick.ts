/** Radius, in px, at which dragging the thumb reaches full control deflection. */
export const JOYSTICK_RANGE_PX = 56
export const JOYSTICK_DEADZONE = 0.1

export interface JoystickVector {
  x: number
  y: number
  roll: number
  pitch: number
}

/** Clamp a drag to the circular stick gate and turn screen movement into flight axes. */
export function joystickVector(deltaX: number, deltaY: number): JoystickVector {
  const distance = Math.hypot(deltaX, deltaY)
  const scale = distance > JOYSTICK_RANGE_PX ? JOYSTICK_RANGE_PX / distance : 1
  const x = deltaX * scale
  const y = deltaY * scale
  const insideDeadzone = distance < JOYSTICK_RANGE_PX * JOYSTICK_DEADZONE
  return {
    x,
    y,
    roll: insideDeadzone ? 0 : x / JOYSTICK_RANGE_PX,
    // Screen y increases downward; dragging up should climb.
    pitch: insideDeadzone ? 0 : -y / JOYSTICK_RANGE_PX,
  }
}
