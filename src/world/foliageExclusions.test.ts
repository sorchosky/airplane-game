import { describe, expect, it } from 'vitest'
import {
  addFoliageExclusion,
  foliageExclusions,
  foliageExclusionVersion,
} from './foliageExclusions'

describe('foliage exclusions', () => {
  it('adds and removes zones and bumps the version each time', () => {
    const start = foliageExclusionVersion()
    const remove = addFoliageExclusion({ x: 10, z: 20, radius: 30 })
    expect(foliageExclusions()).toContainEqual({ x: 10, z: 20, radius: 30 })
    expect(foliageExclusionVersion()).toBe(start + 1)
    remove()
    remove()
    expect(foliageExclusions()).toHaveLength(0)
    expect(foliageExclusionVersion()).toBe(start + 2)
  })
})
