import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { ControlInput } from '../input/types'
import {
  DEFAULT_FLIGHT_PARAMS,
  FIXED_DT,
  createInitialFlightState,
  step,
  type FlightState,
} from './flightModel'

const params = DEFAULT_FLIGHT_PARAMS

function input(overrides: Partial<ControlInput> = {}): ControlInput {
  return {
    roll: 0,
    pitch: 0,
    active: true,
    confidence: 1,
    source: 'keyboard',
    ...overrides,
  }
}

function stepMany(
  state: FlightState,
  control: ControlInput,
  dt: number,
  count: number,
): FlightState {
  let next = state
  for (let i = 0; i < count; i++) {
    next = step(next, control, dt, params)
  }
  return next
}

describe('step', () => {
  it('stays level, on heading, and at cruise speed with no input', () => {
    const state = stepMany(createInitialFlightState(params), input(), FIXED_DT, 300)

    expect(state.bank).toBeCloseTo(0, 5)
    expect(state.pitchAngle).toBeCloseTo(0, 5)
    expect(state.heading).toBeCloseTo(0, 5)
    expect(state.position.y).toBeCloseTo(0, 5)
    expect(state.speed).toBeCloseTo(params.cruiseSpeed, 5)
  })

  it('rolls toward, but never past, the max bank angle', () => {
    const state = stepMany(createInitialFlightState(params), input({ roll: 1 }), FIXED_DT, 180)

    expect(state.bank).toBeGreaterThan(0)
    expect(state.bank).toBeLessThanOrEqual(params.maxBankAngle + 1e-6)
    expect(state.bank).toBeCloseTo(params.maxBankAngle, 2)
  })

  it('turns in the direction of the roll: right banks turn right, left banks turn left', () => {
    const right = stepMany(createInitialFlightState(params), input({ roll: 1 }), FIXED_DT, 180)
    const left = stepMany(createInitialFlightState(params), input({ roll: -1 }), FIXED_DT, 180)

    expect(right.bank).toBeGreaterThan(0)
    expect(right.heading).toBeLessThan(0)

    expect(left.bank).toBeLessThan(0)
    expect(left.heading).toBeGreaterThan(0)

    // symmetric input should produce a symmetric (mirrored) turn
    expect(right.heading).toBeCloseTo(-left.heading, 3)
  })

  it('climbs on positive pitch and dives on negative pitch, easing speed accordingly', () => {
    const climbing = stepMany(createInitialFlightState(params), input({ pitch: 1 }), FIXED_DT, 120)
    const diving = stepMany(createInitialFlightState(params), input({ pitch: -1 }), FIXED_DT, 120)

    expect(climbing.pitchAngle).toBeGreaterThan(0)
    expect(climbing.position.y).toBeGreaterThan(0)
    expect(climbing.speed).toBeLessThan(params.cruiseSpeed)
    expect(climbing.speed).toBeGreaterThanOrEqual(params.minSpeed)

    expect(diving.pitchAngle).toBeLessThan(0)
    expect(diving.position.y).toBeLessThan(0)
    expect(diving.speed).toBeGreaterThan(params.cruiseSpeed)
    expect(diving.speed).toBeLessThanOrEqual(params.maxSpeed)
  })

  it('returns to level flight within a few seconds after input is released', () => {
    const banked = stepMany(
      createInitialFlightState(params),
      input({ roll: 1, pitch: 1 }),
      FIXED_DT,
      120,
    )
    expect(Math.abs(banked.bank)).toBeGreaterThan(0.1)
    expect(Math.abs(banked.pitchAngle)).toBeGreaterThan(0.05)

    // active: false is the autopilot path -- same function, targets snap to level.
    const leveled = stepMany(banked, input({ active: false }), FIXED_DT, 180)

    expect(leveled.bank).toBeCloseTo(0, 2)
    expect(leveled.pitchAngle).toBeCloseTo(0, 2)
  })

  it('holds a hard ceiling under a sustained climb', () => {
    let state = createInitialFlightState(params)
    const climbing = input({ pitch: 1 })
    for (let i = 0; i < 60 * 120; i++) {
      state = step(state, climbing, FIXED_DT, params)
      expect(state.position.y).toBeLessThanOrEqual(params.ceiling)
    }
    // it should have actually gotten close to the ceiling, not just trivially stayed under it
    expect(state.position.y).toBeGreaterThan(params.ceiling - 5)
  })

  it('produces equivalent results regardless of how dt is chunked', () => {
    const control = input({ roll: 0.6, pitch: -0.3 })

    const fine = stepMany(createInitialFlightState(params), control, FIXED_DT, 120) // 120 * 1/60s
    const coarse = stepMany(createInitialFlightState(params), control, 0.5, 4) // 4 * 0.5s

    expect(coarse.position.x).toBeCloseTo(fine.position.x, 3)
    expect(coarse.position.y).toBeCloseTo(fine.position.y, 3)
    expect(coarse.position.z).toBeCloseTo(fine.position.z, 3)
    expect(coarse.bank).toBeCloseTo(fine.bank, 3)
    expect(coarse.pitchAngle).toBeCloseTo(fine.pitchAngle, 3)
    expect(coarse.heading).toBeCloseTo(fine.heading, 3)
    expect(coarse.speed).toBeCloseTo(fine.speed, 3)
  })

  it('is a pure function: it never mutates the state it was given', () => {
    const state = createInitialFlightState(params)
    const positionBefore = state.position.clone()
    const orientationBefore = state.orientation.clone()

    step(state, input({ roll: 1, pitch: 1 }), FIXED_DT, params)

    expect(state.position.equals(positionBefore)).toBe(true)
    expect(state.orientation.equals(orientationBefore)).toBe(true)
  })
})

describe('soft floor', () => {
  const ground = 100

  function startAt(y: number): FlightState {
    const state = createInitialFlightState(params)
    state.position.y = y
    return state
  }

  it('does nothing well above the ground', () => {
    const withFloor = step(startAt(500), input(), 1, params, ground)
    const without = step(startAt(500), input(), 1, params)
    expect(withFloor.position.y).toBeCloseTo(without.position.y, 6)
    expect(withFloor.pitchAngle).toBeCloseTo(without.pitchAngle, 6)
  })

  it('never lets the plane go below the ground, even in a sustained full dive', () => {
    let state = startAt(ground + 60)
    for (let i = 0; i < 600; i++) {
      state = step(state, input({ pitch: -1 }), FIXED_DT, params, ground)
      expect(state.position.y).toBeGreaterThanOrEqual(ground + params.floorMinAltitude - 1e-9)
    }
  })

  it('pulls the nose up by itself when diving into the ground', () => {
    let state = startAt(ground + 60)
    for (let i = 0; i < 600; i++) {
      state = step(state, input({ pitch: -1 }), FIXED_DT, params, ground)
    }
    // Pilot is still holding full dive, but the floor bias wins: nose up, climbing back out.
    expect(state.pitchAngle).toBeGreaterThan(0)
  })

  it('ramps the pitch-up bias with depth into the clearance band', () => {
    const shallow = step(
      startAt(ground + params.floorClearance * 0.75),
      input(),
      0.2,
      params,
      ground,
    )
    const deep = step(startAt(ground + params.floorClearance * 0.25), input(), 0.2, params, ground)
    expect(shallow.pitchAngle).toBeGreaterThan(0)
    expect(deep.pitchAngle).toBeGreaterThan(shallow.pitchAngle)
  })

  it('lifts the plane with rising ground, and the ground wins over the ceiling', () => {
    const buried = step(startAt(ground - 50), input(), FIXED_DT, params, ground)
    expect(buried.position.y).toBeGreaterThanOrEqual(ground + params.floorMinAltitude)

    const highGround = params.ceiling + 50
    const overPeak = step(startAt(params.ceiling), input(), FIXED_DT, params, highGround)
    expect(overPeak.position.y).toBeGreaterThanOrEqual(highGround + params.floorMinAltitude)
  })

  it('starts at the given spawn position', () => {
    const state = createInitialFlightState(params, new Vector3(10, 200, -30))
    expect(state.position.toArray()).toEqual([10, 200, -30])
  })
})
