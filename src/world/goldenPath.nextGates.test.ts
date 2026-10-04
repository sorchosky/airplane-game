import { describe, expect, it } from 'vitest'
import { createGoldenPathRoute, nextGates } from './goldenPath'
import { ROUTE } from './route'

describe('nextGates', () => {
  const course = createGoldenPathRoute()

  it('returns the requested rings ahead in route order', () => {
    const selected = nextGates(course.gates[course.rings[2]!]!.s + 1, 3, course)
    expect(selected.map((gate) => gate.s)).toEqual(
      course.rings.slice(3, 6).map((index) => course.gates[index]!.s),
    )
  })

  it('wraps past the return notch into the next lap', () => {
    const selected = nextGates(ROUTE.length - 1, 3, course)
    expect(selected.map((gate) => gate.s)).toEqual(
      course.rings.slice(0, 3).map((index) => course.gates[index]!.s),
    )
  })

  it('uses the nearest route position even when the plane is far off route', () => {
    const nearest = ROUTE.nearest(50_000, -50_000)
    expect(nextGates(nearest.s, 3, course)).toHaveLength(3)
  })
})
