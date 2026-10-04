import { describe, expect, it } from 'vitest'
import { ringPointerPosition } from './ringPointerMath'

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const viewport = { width: 1000, height: 500 }

describe('ring pointer projection', () => {
  it('returns null inside the 10% inset', () => {
    expect(ringPointerPosition(identity, { x: 0.79, y: 0.79, z: 0 }, viewport)).toBeNull()
  })

  it.each([
    ['left', { x: -2, y: 0, z: 0 }, 100, 250, Math.PI],
    ['right', { x: 2, y: 0, z: 0 }, 900, 250, 0],
    ['above', { x: 0, y: 2, z: 0 }, 500, 50, -Math.PI / 2],
    ['below', { x: 0, y: -2, z: 0 }, 500, 450, Math.PI / 2],
  ])('points %s', (_label, ring, x, y, angle) => {
    const result = ringPointerPosition(identity, ring, viewport)
    expect(result?.x).toBe(x)
    expect(result?.y).toBe(y)
    expect(Math.abs(result?.angle ?? 0)).toBeCloseTo(Math.abs(angle))
  })

  it('does not mirror a ring behind the camera', () => {
    const perspective = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -1, 0]
    const result = ringPointerPosition(perspective, { x: 2, y: 0, z: 1 }, viewport)
    expect(result?.x).toBe(900)
    expect(result?.angle).toBeCloseTo(0)
  })
})
