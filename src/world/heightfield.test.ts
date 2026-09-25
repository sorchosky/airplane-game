import { describe, expect, it } from 'vitest'
import { findSpawnPoint, heightAt, normalAt } from './heightfield'
import { TERRAIN_CONFIG } from './terrainConfig'

const config = TERRAIN_CONFIG

describe('heightAt', () => {
  it('is deterministic for a given seed', () => {
    const points = [
      [0, 0],
      [1234.5, -987.25],
      [-40000, 25000],
    ] as const
    for (const [x, z] of points) {
      expect(heightAt(x, z, config)).toBe(heightAt(x, z, config))
      expect(heightAt(x, z, { ...config })).toBe(heightAt(x, z, config))
    }
  })

  it('gives a different world for a different seed', () => {
    const other = { ...config, seed: 'another-world' }
    let differences = 0
    for (let i = 0; i < 20; i++) {
      if (Math.abs(heightAt(i * 700, i * 300, config) - heightAt(i * 700, i * 300, other)) > 1) {
        differences++
      }
    }
    expect(differences).toBeGreaterThan(15)
  })

  it('stays within a sane band and has hills, high ground and valleys', () => {
    const heights: number[] = []
    for (let x = -15000; x <= 15000; x += 250) {
      for (let z = -15000; z <= 15000; z += 250) heights.push(heightAt(x, z, config))
    }
    const min = Math.min(...heights)
    const max = Math.max(...heights)
    expect(min).toBeGreaterThanOrEqual(0)
    // Stays under the flight model's 600 m ceiling so every ridge can be flown over.
    expect(max).toBeLessThan(600)
    expect(max).toBeGreaterThan(300)
    // Mostly rolling hills: the median sits in the hill band.
    const median = [...heights].sort((a, b) => a - b)[Math.floor(heights.length / 2)] ?? 0
    expect(median).toBeLessThan(config.hillHeight)
  })

  it('is continuous: nearby points have nearby heights', () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 911
      const z = -i * 577
      expect(Math.abs(heightAt(x + 1, z, config) - heightAt(x, z, config))).toBeLessThan(5)
    }
  })
})

describe('normalAt', () => {
  it('returns a unit vector pointing up-ish', () => {
    const [x, y, z] = normalAt(321, 654, config)
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6)
    expect(y).toBeGreaterThan(0)
  })

  it('is straight up on flat ground', () => {
    const flat = { ...config, hillHeight: 0, mountainHeight: 0, peakHeight: 0, plateauHeight: 0 }
    const [x, y, z] = normalAt(100, 100, flat)
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(1, 6)
    expect(z).toBeCloseTo(0, 6)
  })
})

describe('findSpawnPoint', () => {
  it('is deterministic and sits in low ground', () => {
    const spawn = findSpawnPoint(config)
    expect(findSpawnPoint(config)).toEqual(spawn)
    expect(spawn.groundHeight).toBeCloseTo(heightAt(spawn.x, spawn.z, config), 6)
    expect(spawn.groundHeight).toBeLessThan(config.hillHeight * 0.5)
  })
})
