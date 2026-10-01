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
  plungeDistanceAlong,
  revealPoint,
  slopeDegreesAt,
  visibleFraction,
  type LandmarkKind,
} from './landmarks'
import { ROUTE } from './route'
import { LANDMARK_STATIONS } from './routePoints'
import { TERRAIN_CONFIG } from './terrainConfig'

const landmarks = getLandmarks()
const spawn = findSpawnPoint(TERRAIN_CONFIG)
const deg = (degrees: number): number => (degrees * Math.PI) / 180

describe('placeLandmarks', () => {
  it('places all five kinds, once each', () => {
    const kinds = landmarks.map((l) => l.kind).sort()
    const expected: LandmarkKind[] = ['arch', 'ruins', 'tower', 'tree', 'waterfall']
    expect(kinds).toEqual(expected)
  })

  it('is deterministic', () => {
    expect(placeLandmarks()).toEqual(landmarks)
  })

  it('stands each landmark at its station: arc length plus lateral offset', () => {
    for (const l of landmarks) {
      const station = LANDMARK_STATIONS.find((candidate) => candidate.kind === l.kind)
      if (!station) throw new Error(`no station for ${l.kind}`)
      expect(l.station).toBe(station.s)
      expect(l.lateral).toBe(station.lateral)
      // The route agrees on where it is: nearest at the station, as far off as authored.
      const nearest = ROUTE.nearest(l.x, l.z)
      expect(nearest.s).toBeCloseTo(station.s, -1)
      expect(nearest.lateral).toBeCloseTo(station.lateral, 0)
    }
  })

  it('reveals each landmark after the station before it', () => {
    const stations = landmarks.map((l) => l.station).sort((a, b) => a - b)
    for (let i = 1; i < stations.length; i++) {
      expect(stations[i]! - LANDMARK_CONFIG.revealDistance).toBeGreaterThan(stations[i - 1]!)
    }
    // The first reveal is past spawn.
    expect(stations[0]! - LANDMARK_CONFIG.revealDistance).toBeGreaterThan(0)
  })

  it('stands every footprint on dry land gentler than 20°', () => {
    const floor = TERRAIN_CONFIG.waterLevel + LANDMARK_CONFIG.minHeightAboveWater
    const { footprintSamples, maxSlopeDegrees, slopeProbe } = LANDMARK_CONFIG
    for (const l of landmarks) {
      const radius = l.footprints[0]?.radius ?? 0
      expect(l.y).toBeCloseTo(heightAt(l.x, l.z, TERRAIN_CONFIG), 6)
      expect(l.relief).toBeGreaterThanOrEqual(0)
      // The #76 survey: the centre and rings at 35, 70 and 100 %, held to the limits exactly.
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

  it('keeps at least half of every landmark in sight from its reveal, 1.5 km back', () => {
    for (const l of landmarks) {
      const reveal = revealPoint(l)
      const eye = [reveal.x, reveal.floorHeight + LANDMARK_CONFIG.routeEyeHeight, reveal.z] as const
      const radius = l.footprints[0]?.radius ?? 0
      expect(
        visibleFraction(eye, l.x, l.z, l.y, l.height, radius),
        `${l.kind} from s = ${l.station - LANDMARK_CONFIG.revealDistance} m`,
      ).toBeGreaterThanOrEqual(LANDMARK_CONFIG.minVisibleFraction)
    }
  })

  it('reads a sightline over a valley wall as hidden', () => {
    // From 10 m over the ground 700 m off the route, past the 100 m wall shoulder, a 20 m stub on
    // the valley floor is out of sight.
    const tower = landmarks.find((l) => l.kind === 'tower')
    if (!tower) throw new Error('no tower')
    const point = ROUTE.pointAt(tower.station)
    const tangent = ROUTE.tangentAt(tower.station)
    const x = point.x + tangent.z * 700
    const z = point.z - tangent.x * 700
    const eye = [x, heightAt(x, z, TERRAIN_CONFIG) + 10, z] as const
    expect(visibleFraction(eye, point.x, point.z, point.floorHeight, 20, 0)).toBe(0)
  })

  it('pours the waterfall into its pool, in front of it and facing the route', () => {
    const fall = landmarks.find((l) => l.kind === 'waterfall')
    if (!fall?.plungeDistance) throw new Error('no waterfall')
    expect(plungeDistanceAlong(fall.x, fall.z, fall.yaw)).toBe(fall.plungeDistance)
    const [fx, fz] = bearingVector(fall.yaw)
    const x = fall.x + fx * fall.plungeDistance
    const z = fall.z + fz * fall.plungeDistance
    expect(heightAt(x, z, TERRAIN_CONFIG)).toBeLessThan(TERRAIN_CONFIG.waterLevel)
    // The pool stays off the centreline, so the route floor is dry ground.
    const point = ROUTE.pointAt(fall.station)
    expect(heightAt(point.x, point.z, TERRAIN_CONFIG)).toBeGreaterThan(TERRAIN_CONFIG.waterLevel)
    expect(angleBetween(bearingTo(fall.x, fall.z, point.x, point.z), fall.yaw)).toBeLessThan(1e-9)
  })

  it('lays the arch across the route and puts its trigger in the opening', () => {
    const arch = landmarks.find((l) => l.kind === 'arch')
    if (!arch) throw new Error('no arch')
    const tangent = ROUTE.tangentAt(arch.station)
    const [fx, fz] = bearingVector(arch.yaw)
    expect(fx * tangent.x + fz * tangent.z).toBeCloseTo(1, 9)
    expect(arch.trigger.shape).toBe('box')
    // Flying down the route at low cruise through the arch's centre crosses the trigger.
    expect(insideTrigger(arch.trigger, [arch.x, arch.y + 40, arch.z])).toBe(true)
    expect(insideTrigger(arch.trigger, [arch.x, arch.y + 200, arch.z])).toBe(false)
    // Beside a leg is outside.
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
  it('each frame their landmark from its reveal point, dead ahead', () => {
    for (const l of landmarks) {
      const shot = SHOT_BOOKMARKS.find((s) => s.name === `landmark-${l.kind}`)
      if (!shot) throw new Error(`no bookmark for ${l.kind}`)
      const [x, y, z] = shot.position
      const reveal = revealPoint(l)
      expect(Math.hypot(reveal.x - x, reveal.z - z)).toBeLessThan(2)
      expect(Math.abs(y - (reveal.floorHeight + LANDMARK_CONFIG.routeEyeHeight))).toBeLessThan(2)
      expect(angleBetween(bearingTo(x, z, l.x, l.z), shot.heading)).toBeLessThan(deg(1))
      // And fly clear of the ground they start over.
      expect(y).toBeGreaterThan(heightAt(x, z, TERRAIN_CONFIG) + 20)
    }
  })
})
