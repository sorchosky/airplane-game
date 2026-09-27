import { describe, expect, it } from 'vitest'
import { getLandmarks } from './landmarks'
import { isExcluded } from './scatter'
import {
  addFoliageExclusion,
  allFoliageExclusions,
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

describe('landmark footprints', () => {
  it('are always excluded, with a margin for canopies', () => {
    const landmark = getLandmarks()[0]
    const footprint = landmark?.footprints[0]
    if (!footprint) throw new Error('expected at least one landmark')
    expect(isExcluded(footprint.x, footprint.z, allFoliageExclusions())).toBe(true)
    expect(
      isExcluded(footprint.x + footprint.radius + 3, footprint.z, allFoliageExclusions()),
    ).toBe(true)
  })
})
