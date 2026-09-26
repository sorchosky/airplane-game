import { describe, expect, it } from 'vitest'
import { SHOT_BOOKMARKS } from '../debug/shots'
import { findSpawnPoint, heightAt } from './heightfield'
import {
  LANDMARK_CONFIG,
  angleBetween,
  bearingTo,
  bearingVector,
  getLandmarks,
  insideLandmarkFootprint,
  insideTrigger,
  landmarkFarHaze,
  landmarkPassBy,
  placeLandmarks,
  slopeDegreesAt,
  visibleFractionFromSpawn,
  type LandmarkKind,
} from './landmarks'
import { TERRAIN_CONFIG } from './terrainConfig'

const landmarks = getLandmarks()
const spawn = findSpawnPoint(TERRAIN_CONFIG)

describe('placeLandmarks', () => {
  it('places all five kinds, once each', () => {
    const kinds = landmarks.map((l) => l.kind).sort()
    const expected: LandmarkKind[] = ['arch', 'ruins', 'tower', 'tree', 'waterfall']
    expect(kinds).toEqual(expected)
  })

  it('is deterministic', () => {
    expect(placeLandmarks()).toEqual(landmarks)
  })

  it('keeps every landmark 2–5 km from spawn', () => {
    for (const l of landmarks) {
      const d = Math.hypot(l.x - spawn.x, l.z - spawn.z)
      expect(d).toBeGreaterThanOrEqual(2000)
      expect(d).toBeLessThanOrEqual(5000)
      expect(d).toBeCloseTo(l.distance, 6)
      expect(angleBetween(bearingTo(spawn.x, spawn.z, l.x, l.z), l.bearing)).toBeLessThan(1e-9)
    }
  })

  it('puts each on a different bearing, at least 30° apart', () => {
    for (let i = 0; i < landmarks.length; i++) {
      for (let j = i + 1; j < landmarks.length; j++) {
        const a = landmarks[i]
        const b = landmarks[j]
        if (!a || !b) continue
        expect(angleBetween(a.bearing, b.bearing)).toBeGreaterThan((30 * Math.PI) / 180)
      }
    }
  })

  it('stands every footprint on dry land gentler than 20°', () => {
    const floor = TERRAIN_CONFIG.waterLevel + LANDMARK_CONFIG.minHeightAboveWater
    const { footprintSamples, maxSlopeDegrees, slopeProbe } = LANDMARK_CONFIG
    for (const l of landmarks) {
      const radius = l.footprints[0]?.radius ?? 0
      expect(l.y).toBeCloseTo(heightAt(l.x, l.z, TERRAIN_CONFIG), 6)
      expect(l.relief).toBeGreaterThanOrEqual(0)
      // Every point the placement surveyed, held to the limits exactly.
      for (const ring of [0, 0.35, 0.7, 1]) {
        for (let i = 0; i < footprintSamples; i++) {
          const angle = (i / footprintSamples) * Math.PI * 2
          const x = l.x + Math.cos(angle) * radius * ring
          const z = l.z + Math.sin(angle) * radius * ring
          expect(heightAt(x, z, TERRAIN_CONFIG)).toBeGreaterThanOrEqual(floor)
          expect(slopeDegreesAt(x, z, TERRAIN_CONFIG, slopeProbe)).toBeLessThan(maxSlopeDegrees)
        }
      }
      // And a denser grid in between: dry everywhere, with a little slack on the slope for
      // bumps smaller than the survey spacing.
      for (let i = 0; i < 32; i++) {
        const angle = ((i + 0.5) / 32) * Math.PI * 2
        for (const ring of [0.2, 0.5, 0.85]) {
          const x = l.x + Math.cos(angle) * radius * ring
          const z = l.z + Math.sin(angle) * radius * ring
          expect(heightAt(x, z, TERRAIN_CONFIG)).toBeGreaterThan(TERRAIN_CONFIG.waterLevel)
          expect(slopeDegreesAt(x, z, TERRAIN_CONFIG, slopeProbe)).toBeLessThan(maxSlopeDegrees + 3)
        }
      }
    }
  })

  it('keeps at least half of every landmark in sight from spawn', () => {
    for (const l of landmarks) {
      expect(visibleFractionFromSpawn(l.x, l.z, l.y, l.height, spawn)).toBeGreaterThanOrEqual(
        LANDMARK_CONFIG.minVisibleFraction,
      )
    }
  })

  it('pours the waterfall into a lake in front of it', () => {
    const fall = landmarks.find((l) => l.kind === 'waterfall')
    if (!fall?.plungeDistance) throw new Error('no waterfall')
    const [fx, fz] = bearingVector(fall.yaw)
    const x = fall.x + fx * fall.plungeDistance
    const z = fall.z + fz * fall.plungeDistance
    expect(heightAt(x, z, TERRAIN_CONFIG)).toBeLessThan(TERRAIN_CONFIG.waterLevel)
  })

  it('turns the arch to face spawn and puts its trigger in the opening', () => {
    const arch = landmarks.find((l) => l.kind === 'arch')
    if (!arch) throw new Error('no arch')
    expect(arch.yaw).toBe(arch.bearing)
    expect(arch.trigger.shape).toBe('box')
    // Flying straight out from spawn through the arch's centre crosses the trigger.
    expect(insideTrigger(arch.trigger, [arch.x, arch.y + 40, arch.z])).toBe(true)
    expect(insideTrigger(arch.trigger, [arch.x, arch.y + 200, arch.z])).toBe(false)
    // Beside a leg is outside.
    const [fx, fz] = bearingVector(arch.yaw)
    expect(insideTrigger(arch.trigger, [arch.x - fz * 80, arch.y + 40, arch.z + fx * 80])).toBe(
      false,
    )
  })
})

describe('landmark hooks', () => {
  it('reports footprints for foliage to keep clear of', () => {
    for (const l of landmarks) {
      expect(insideLandmarkFootprint(l.x, l.z, landmarks)).toBe(true)
    }
    expect(insideLandmarkFootprint(spawn.x, spawn.z, landmarks)).toBe(false)
    const tree = landmarks.find((l) => l.kind === 'tree')
    if (!tree) throw new Error('no tree')
    const edge = (tree.footprints[0]?.radius ?? 0) + 5
    expect(insideLandmarkFootprint(tree.x + edge, tree.z, landmarks)).toBe(false)
    expect(insideLandmarkFootprint(tree.x + edge, tree.z, landmarks, 10)).toBe(true)
  })

  it('tests points against sphere triggers', () => {
    const trigger = { shape: 'sphere' as const, center: [0, 0, 0] as const, radius: 10 }
    expect(insideTrigger(trigger, [0, 9, 0])).toBe(true)
    expect(insideTrigger(trigger, [8, 8, 0])).toBe(false)
  })

  it('gives the doppler closing speed toward the sound anchor', () => {
    const landmark = { soundAnchor: [0, 0, -100] as const }
    // Flying straight at it at 50 m/s.
    expect(landmarkPassBy(landmark, [0, 0, 0], [0, 0, -50])).toEqual({
      distance: 100,
      closingSpeed: 50,
    })
    // Flying away.
    expect(landmarkPassBy(landmark, [0, 0, 0], [0, 0, 50]).closingSpeed).toBe(-50)
    // Passing abeam: no closing speed.
    expect(landmarkPassBy(landmark, [0, 0, -100 + 1e-9], [50, 0, 0]).closingSpeed).toBeCloseTo(0)
  })
})

describe('landmarkFarHaze', () => {
  const near = TERRAIN_CONFIG.hazeFadeStart
  const far = TERRAIN_CONFIG.hazeFadeEnd

  it('matches the terrain haze up close', () => {
    expect(landmarkFarHaze(near * 0.5, near, far)).toBe(0)
  })

  it('never passes the cap inside the terrain fade, so silhouettes hold at 5 km and beyond', () => {
    for (let d = 0; d <= far; d += 250) {
      expect(landmarkFarHaze(d, near, far)).toBeLessThanOrEqual(LANDMARK_CONFIG.hazeCap + 1e-9)
    }
    expect(landmarkFarHaze(far, near, far)).toBeCloseTo(LANDMARK_CONFIG.hazeCap)
  })

  it('lets go to full haze before the far plane', () => {
    expect(landmarkFarHaze(far * LANDMARK_CONFIG.hazeRelease, near, far)).toBe(1)
    // The camera's far plane is 1.2 × the view distance, past the release.
    expect(far * LANDMARK_CONFIG.hazeRelease).toBeLessThanOrEqual(TERRAIN_CONFIG.viewDistance * 1.2)
  })
})

describe('landmark bookmarks', () => {
  it('each frame their landmark within 20° of straight ahead and 1.5 km', () => {
    for (const l of landmarks) {
      const shot = SHOT_BOOKMARKS.find((s) => s.name === `landmark-${l.kind}`)
      if (!shot) throw new Error(`no bookmark for ${l.kind}`)
      const [x, , z] = shot.position
      expect(Math.hypot(l.x - x, l.z - z)).toBeLessThan(1500)
      expect(angleBetween(bearingTo(x, z, l.x, l.z), shot.heading)).toBeLessThan(
        (20 * Math.PI) / 180,
      )
      // And fly clear of the ground they start over.
      expect(shot.position[1]).toBeGreaterThan(heightAt(x, z, TERRAIN_CONFIG) + 20)
    }
  })
})
