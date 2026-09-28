import { describe, expect, it } from 'vitest'
import { joystickVector, JOYSTICK_RANGE_PX } from './touchJoystick'

describe('joystickVector', () => {
  it('maps drag direction to roll and pitch, with up meaning climb', () => {
    expect(joystickVector(JOYSTICK_RANGE_PX / 2, 0)).toMatchObject({ roll: 0.5, pitch: -0 })
    expect(joystickVector(0, -JOYSTICK_RANGE_PX / 2)).toMatchObject({ roll: 0, pitch: 0.5 })
  })

  it('clamps diagonal movement to a circular gate', () => {
    const result = joystickVector(JOYSTICK_RANGE_PX, JOYSTICK_RANGE_PX)
    expect(Math.hypot(result.x, result.y)).toBeCloseTo(JOYSTICK_RANGE_PX)
    expect(Math.hypot(result.roll, result.pitch)).toBeCloseTo(1)
    expect(result.roll).toBeCloseTo(Math.SQRT1_2)
    expect(result.pitch).toBeCloseTo(-Math.SQRT1_2)
  })

  it('does not amplify movement inside the gate', () => {
    expect(joystickVector(18, 36)).toEqual({ x: 18, y: 36, roll: 0.25, pitch: -0.5 })
  })
})
