import { describe, expect, it } from 'vitest'
import { color, space, type } from './tokens'

describe('design tokens', () => {
  it('defines a color role for every surface used in the greybox scene', () => {
    expect(color.sky).toMatch(/^#/)
    expect(color.ground).toMatch(/^#/)
    expect(color.accent).toMatch(/^#/)
  })

  it('lays spacing out on an 8pt grid', () => {
    for (const value of Object.values(space)) {
      const px = Number.parseInt(value, 10)
      expect(px % 4).toBe(0)
    }
  })

  it('sizes the TV type scale with viewport-relative units', () => {
    for (const value of Object.values(type)) {
      expect(value).toMatch(/clamp\(/)
    }
  })
})
