import { Euler, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  SHOT_BOOKMARKS,
  findShot,
  getShotFromUrl,
  shotCameraPosition,
  shotFlightState,
} from './shots'

describe('shot bookmarks', () => {
  it('have unique names, usable in a URL', () => {
    const names = SHOT_BOOKMARKS.map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(/^[a-z0-9-]+$/)
  })

  it('all sit above the 2 m hard floor over water (never inside the lake)', () => {
    for (const shot of SHOT_BOOKMARKS) expect(shot.position[1]).toBeGreaterThan(34)
  })

  it('parse from ?shot= and ignore unknown names', () => {
    expect(getShotFromUrl('?shot=spawn')?.name).toBe('spawn')
    expect(getShotFromUrl('?input=keyboard&shot=lake-bank')?.name).toBe('lake-bank')
    expect(getShotFromUrl('?shot=nope')).toBeNull()
    expect(getShotFromUrl('')).toBeNull()
    expect(findShot(null)).toBeNull()
  })
})

describe('shotFlightState', () => {
  it('parks the plane at the bookmark with the springs at rest', () => {
    const shot = findShot('lake-bank')
    if (!shot) throw new Error('missing bookmark')
    const state = shotFlightState(shot, 45)
    expect(state.position.toArray()).toEqual([...shot.position])
    expect(state.bank).toBe(shot.bank)
    expect(state.heading).toBe(shot.heading)
    expect(state.speed).toBe(45)
    expect(state.bankRate).toBe(0)
    expect(state.pitchRate).toBe(0)
    expect(state.yawBank).toBe(shot.bank)
    expect(state.floorContact).toBe(0)
  })

  it('composes the orientation exactly like the flight model (YXZ euler, roll = -bank)', () => {
    const shot = findShot('plane-hero')
    if (!shot) throw new Error('missing bookmark')
    const state = shotFlightState(shot, 45)
    const expected = new Quaternion().setFromEuler(
      new Euler(shot.pitchAngle, shot.heading, -shot.bank, 'YXZ'),
    )
    expect(Math.abs(state.orientation.dot(expected))).toBeCloseTo(1, 6)
  })
})

describe('shotCameraPosition', () => {
  it('is the plane position when there is no override', () => {
    const shot = findShot('spawn')
    if (!shot) throw new Error('missing bookmark')
    expect(shotCameraPosition(shot)).toEqual([...shot.position])
  })

  it('rotates the [right, up, forward] offset into the heading frame', () => {
    const base = { name: 'x', bank: 0, pitchAngle: 0, purpose: '', position: [0, 0, 0] } as const
    // Heading 0: forward is -Z, right is +X.
    expect(shotCameraPosition({ ...base, heading: 0, cameraOffset: [1, 2, 3] })).toEqual([1, 2, -3])
    // Heading 90° (looking toward -X): forward is -X, right is -Z.
    const turned = shotCameraPosition({ ...base, heading: Math.PI / 2, cameraOffset: [1, 2, 3] })
    expect(turned[0]).toBeCloseTo(-3, 6)
    expect(turned[1]).toBeCloseTo(2, 6)
    expect(turned[2]).toBeCloseTo(-1, 6)
  })

  it('agrees with rotating the offset by the flight orientation at zero bank and pitch', () => {
    const shot = findShot('plane-hero')
    if (!shot) throw new Error('missing bookmark')
    const level = { ...shot, bank: 0, pitchAngle: 0 }
    const [right, up, forward] = shot.cameraOffset ?? [0, 0, 0]
    const rotated = new Vector3(right, up, -forward)
      .applyQuaternion(shotFlightState(level, 45).orientation)
      .add(new Vector3(...shot.position))
    const [x, y, z] = shotCameraPosition(level)
    expect(x).toBeCloseTo(rotated.x, 6)
    expect(y).toBeCloseTo(rotated.y, 6)
    expect(z).toBeCloseTo(rotated.z, 6)
  })
})
