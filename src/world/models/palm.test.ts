import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { buildPalm, PALM_HEIGHT, PALM_VARIANTS } from './palm'
import { triangleCount } from './foliage'

const deg = (radians: number) => (radians * 180) / Math.PI

describe('palm model', () => {
  const palm = buildPalm()

  it('stays within 150 triangles', () => {
    expect(triangleCount(palm.body)).toBeLessThanOrEqual(150)
    expect(triangleCount(palm.hull)).toBeLessThanOrEqual(150)
  })

  it('carries the sway weight and colour on body and hull, 0 at the foot and 1 at the tips', () => {
    for (const geometry of [palm.body, palm.hull]) {
      const sway = geometry.getAttribute('foliageSway')
      expect(sway.count).toBe(geometry.getAttribute('position').count)
      expect(geometry.getAttribute('color').count).toBe(sway.count)
      let min = Infinity
      let max = -Infinity
      for (let i = 0; i < sway.count; i++) {
        min = Math.min(min, sway.getX(i))
        max = Math.max(max, sway.getX(i))
      }
      expect(min).toBe(0)
      expect(max).toBe(1)
    }
  })

  it('stands about 9 m tall with a crown of fronds that droops below its top', () => {
    palm.body.computeBoundingBox()
    const box = palm.body.boundingBox!
    expect(box.min.y).toBeLessThan(-0.5)
    expect(box.max.y).toBeGreaterThan(PALM_HEIGHT * 0.9)
    expect(box.max.y).toBeLessThan(PALM_HEIGHT * 1.15)
    // The fronds hang: the tips sit below the crown.
    const position = palm.body.getAttribute('position')
    const sway = palm.body.getAttribute('foliageSway')
    const tips: number[] = []
    for (let i = 0; i < position.count; i++) if (sway.getX(i) === 1) tips.push(position.getY(i))
    expect(Math.max(...tips)).toBeLessThan(PALM_HEIGHT - 1)
  })

  it('has a trunk of five tapered segments leaning 10 to 30 degrees across the variants', () => {
    const position = palm.body.getAttribute('position')
    // Trunk rings are the distinct heights of vertices with no sway above 0.31 (the trunk's own).
    const sway = palm.body.getAttribute('foliageSway')
    const heights = new Set<number>()
    let top = new Vector3(0, -Infinity, 0)
    for (let i = 0; i < position.count; i++) {
      if (sway.getX(i) <= 0.3 + 1e-6 && position.getY(i) >= 0) {
        heights.add(Math.round(position.getY(i) * 1000))
        if (position.getY(i) > top.y && position.getY(i) < PALM_HEIGHT)
          top = new Vector3().fromBufferAttribute(position, i)
      }
    }
    // Rings at the ground and the five segments' tops, plus the cap's apex.
    expect(heights.size).toBeGreaterThanOrEqual(6)
    const chord = deg(Math.atan2(top.x, top.y))
    for (const variant of PALM_VARIANTS) {
      const lean = chord + deg(variant.tilt)
      expect(lean).toBeGreaterThanOrEqual(9)
      expect(lean).toBeLessThanOrEqual(31)
    }
    // Three variants of height.
    expect(new Set(PALM_VARIANTS.map((v) => v.scale)).size).toBe(3)
    expect(new Set(PALM_VARIANTS.map((v) => v.tilt)).size).toBe(3)
  })
})
