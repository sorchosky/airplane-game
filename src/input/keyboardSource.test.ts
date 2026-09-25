import { describe, expect, it } from 'vitest'
import { targetPitch, targetRoll } from './keyboardSource'

describe('targetRoll', () => {
  it('is neutral with no keys pressed', () => {
    expect(targetRoll(new Set())).toBe(0)
  })

  it('rolls left on A or ArrowLeft', () => {
    expect(targetRoll(new Set(['a']))).toBe(-1)
    expect(targetRoll(new Set(['ArrowLeft']))).toBe(-1)
  })

  it('rolls right on D or ArrowRight', () => {
    expect(targetRoll(new Set(['d']))).toBe(1)
    expect(targetRoll(new Set(['ArrowRight']))).toBe(1)
  })

  it('cancels out when both directions are held', () => {
    expect(targetRoll(new Set(['a', 'd']))).toBe(0)
  })
})

describe('targetPitch', () => {
  it('is neutral with no keys pressed', () => {
    expect(targetPitch(new Set())).toBe(0)
  })

  it('dives on W or ArrowUp', () => {
    expect(targetPitch(new Set(['w']))).toBe(-1)
    expect(targetPitch(new Set(['ArrowUp']))).toBe(-1)
  })

  it('climbs on S or ArrowDown', () => {
    expect(targetPitch(new Set(['s']))).toBe(1)
    expect(targetPitch(new Set(['ArrowDown']))).toBe(1)
  })

  it('cancels out when both directions are held', () => {
    expect(targetPitch(new Set(['w', 's']))).toBe(0)
  })
})
