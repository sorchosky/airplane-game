import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { ControlInput } from '../input/types'
import {
  DEFAULT_FLIGHT_PARAMS,
  FIXED_DT,
  FLIGHT_FEEL,
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
    let peakPitch = -Infinity
    for (let i = 0; i < 600; i++) {
      state = step(state, input({ pitch: -1 }), FIXED_DT, params, ground)
      peakPitch = Math.max(peakPitch, state.pitchAngle)
    }
    // Pilot is still holding full dive, but the floor bias pulls the nose up, then cancels the
    // dive exactly: the plane levels off inside the clearance band instead of flying into the hill.
    expect(peakPitch).toBeGreaterThan(0)
    expect(state.pitchAngle).toBeGreaterThan(-1e-6)
    expect(state.position.y).toBeGreaterThan(ground + params.floorMinAltitude)
    expect(state.position.y).toBeLessThan(ground + params.floorClearance)
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

// Each FLIGHT_FEEL constant, pinned by what it does in the air (#68).
describe('flight feel', () => {
  const HIGH = new Vector3(0, 400, 0)
  const at = (overrides: Partial<FlightState> = {}): FlightState => ({
    ...createInitialFlightState(params, HIGH),
    ...overrides,
  })
  /** Seconds of flight at the 60 Hz sim rate. */
  const fly = (state: FlightState, control: ControlInput, seconds: number) =>
    stepMany(state, control, FIXED_DT, Math.round(seconds / FIXED_DT))

  it('energyGain: a dive buys speed that carries into the climb after it', () => {
    const dived = fly(at(), input({ pitch: -1 }), 3)
    expect(dived.speed).toBeGreaterThan(params.cruiseSpeed + 8)

    // The same 3 s climb from level flight, entered at cruise or at the speed the dive bought.
    const fromCruise = fly(at(), input({ pitch: 1 }), 3)
    const fromDive = fly(at({ speed: dived.speed }), input({ pitch: 1 }), 3)
    expect(fromDive.position.y - HIGH.y).toBeGreaterThan(fromCruise.position.y - HIGH.y + 5)
    expect(fromDive.speed).toBeGreaterThan(fromCruise.speed)
  })

  it('energyGain: a sustained full dive settles near 64 m/s, under maxSpeed', () => {
    const state = fly(at(), input({ pitch: -1 }), 20)
    expect(state.speed).toBeGreaterThan(62)
    expect(state.speed).toBeLessThan(FLIGHT_FEEL.maxSpeed)
  })

  it('minSpeed still floors a sustained climb', () => {
    const state = fly(at(), input({ pitch: 1 }), 20)
    expect(state.speed).toBeCloseTo(params.minSpeed, 5)
  })

  it('maxSpeed caps speed however it was reached', () => {
    const state = fly(at({ speed: 90 }), input({ pitch: -1 }), 0.1)
    expect(state.speed).toBeLessThanOrEqual(FLIGHT_FEEL.maxSpeed)
  })

  it('speedDecayTime: level flight sheds most of a dive’s extra speed in about 4 s', () => {
    const excess = 64 - params.cruiseSpeed
    const after1s = fly(at({ speed: 64 }), input(), 1).speed - params.cruiseSpeed
    const after4s = fly(at({ speed: 64 }), input(), 4).speed - params.cruiseSpeed
    expect(after1s).toBeGreaterThan(excess * 0.5) // an easing, not a snap
    expect(after4s).toBeLessThan(excess * 0.25)
  })

  it('yawLagTime: the nose follows the wings a beat late', () => {
    const noLag = { ...params, yawLagTime: 0 }
    let lagged = at()
    let instant = at()
    for (let i = 0; i < 12; i++) {
      lagged = step(lagged, input({ roll: 1 }), FIXED_DT, params)
      instant = step(instant, input({ roll: 1 }), FIXED_DT, noLag)
    }
    // After 0.2 s the wings match but the lagged plane has turned less.
    expect(lagged.bank).toBeCloseTo(instant.bank, 10)
    expect(Math.abs(lagged.heading)).toBeLessThan(Math.abs(instant.heading) * 0.8)
    // The lag is short: once the wings settle, the turn bank has caught up with them.
    const settled = fly(lagged, input({ roll: 1 }), 2)
    expect(settled.yawBank).toBeCloseTo(settled.bank, 2)
  })

  it('floorContact reads 0 in open sky and grows with depth into the band', () => {
    const ground = 100
    const clear = step(at({ position: new Vector3(0, 400, 0) }), input(), FIXED_DT, params, ground)
    const shallow = step(
      at({ position: new Vector3(0, 115, 0) }),
      input(),
      FIXED_DT,
      params,
      ground,
    )
    const deep = step(at({ position: new Vector3(0, 104, 0) }), input(), FIXED_DT, params, ground)
    expect(clear.floorContact).toBe(0)
    expect(shallow.floorContact).toBeGreaterThan(FLIGHT_FEEL.floorContactEnter)
    expect(deep.floorContact).toBeGreaterThan(shallow.floorContact)
  })
})

// #66: quick springs, with the weight coming from a rate cap.
describe('bank and pitch rate caps', () => {
  const HIGH = new Vector3(0, 400, 0)
  const toDeg = (rad: number) => (rad * 180) / Math.PI

  it('never banks faster than maxBankRate, even on a full roll', () => {
    let state = createInitialFlightState(params, HIGH)
    let fastest = 0
    for (let i = 0; i < 120; i++) {
      const next = step(state, input({ roll: 1 }), FIXED_DT, params)
      fastest = Math.max(fastest, Math.abs(next.bank - state.bank) / FIXED_DT)
      state = next
    }
    expect(toDeg(fastest)).toBeLessThanOrEqual(toDeg(params.maxBankRate) + 1e-6)
    expect(toDeg(state.bank)).toBeCloseTo(toDeg(params.maxBankAngle), 0)
  })

  it('never pitches faster than maxPitchRate', () => {
    let state = createInitialFlightState(params, HIGH)
    let fastest = 0
    for (let i = 0; i < 120; i++) {
      const next = step(state, input({ pitch: -1 }), FIXED_DT, params)
      fastest = Math.max(fastest, Math.abs(next.pitchAngle - state.pitchAngle) / FIXED_DT)
      state = next
    }
    expect(toDeg(fastest)).toBeLessThanOrEqual(toDeg(params.maxPitchRate) + 1e-6)
  })

  it('still answers a small roll quickly: the cap only bites on big inputs', () => {
    const uncapped = { ...params, maxBankRate: Infinity }
    let capped = createInitialFlightState(params, HIGH)
    let free = createInitialFlightState(uncapped, HIGH)
    for (let i = 0; i < 12; i++) {
      capped = step(capped, input({ roll: 0.2 }), FIXED_DT, params)
      free = step(free, input({ roll: 0.2 }), FIXED_DT, uncapped)
    }
    expect(capped.bank).toBeCloseTo(free.bank, 10)
  })
})

// Each boost constant in FLIGHT_FEEL, pinned by what it does (#93).
describe('boost', () => {
  const boost = (overrides: Partial<ControlInput> = {}) => input({ boost: true, ...overrides })

  it('never fires without a request, and a request under autopilot is ignored', () => {
    let state = stepMany(createInitialFlightState(params), input(), FIXED_DT, 60)
    expect(state.boosting).toBe(false)
    state = stepMany(state, boost({ active: false }), FIXED_DT, 60)
    expect(state.boosting).toBe(false)
    expect(state.speed).toBeCloseTo(params.cruiseSpeed, 5)
  })

  it('boostAcceleration: a readable surge from cruise in level flight', () => {
    const state = stepMany(createInitialFlightState(params), boost(), FIXED_DT, 60)
    expect(state.boosting).toBe(true)
    // One second in: close to the full push, less the drag it has already built.
    expect(state.speed - params.cruiseSpeed).toBeGreaterThan(FLIGHT_FEEL.boostAcceleration * 0.75)
    expect(state.speed - params.cruiseSpeed).toBeLessThan(FLIGHT_FEEL.boostAcceleration)
  })

  it('boostAcceleration: a boost into a full climb bleeds speed exactly as an unboosted climb', () => {
    const start = stepMany(createInitialFlightState(params), input({ pitch: 1 }), FIXED_DT, 60)
    const plain = stepMany(start, input({ pitch: 1 }), FIXED_DT, 60)
    const boosted = stepMany(start, boost({ pitch: 1 }), FIXED_DT, 60)
    expect(boosted.boosting).toBe(true)
    expect(boosted.speed).toBeLessThan(start.speed)
    expect(boosted.speed).toBeCloseTo(plain.speed, 1)
  })

  it('boostAcceleration: a half climb gets part of the push, still less than level', () => {
    const level = stepMany(createInitialFlightState(params), boost(), FIXED_DT, 60)
    const climbing = stepMany(createInitialFlightState(params), boost({ pitch: 0.5 }), FIXED_DT, 60)
    const plain = stepMany(createInitialFlightState(params), input({ pitch: 0.5 }), FIXED_DT, 60)
    expect(climbing.speed).toBeGreaterThan(plain.speed)
    expect(climbing.speed).toBeLessThan(level.speed)
  })

  it('never pushes past maxSpeed, even boosting in a full dive', () => {
    const state = stepMany(createInitialFlightState(params), boost({ pitch: -1 }), FIXED_DT, 180)
    expect(state.speed).toBeLessThanOrEqual(FLIGHT_FEEL.maxSpeed)
  })

  it('boostDuration: a held request ends the burst after one duration', () => {
    const frames = Math.round(FLIGHT_FEEL.boostDuration / FIXED_DT)
    let state = stepMany(createInitialFlightState(params), boost(), FIXED_DT, frames - 2)
    expect(state.boosting).toBe(true)
    state = stepMany(state, boost(), FIXED_DT, 4)
    expect(state.boosting).toBe(false)
    expect(state.boostCooldown).toBeGreaterThan(FLIGHT_FEEL.boostCooldown - 0.1)
  })

  it('boostDuration: holding the request past the cooldown does not start another burst', () => {
    const frames = Math.round(
      (FLIGHT_FEEL.boostDuration + FLIGHT_FEEL.boostCooldown + 1) / FIXED_DT,
    )
    const state = stepMany(createInitialFlightState(params), boost(), FIXED_DT, frames)
    expect(state.boosting).toBe(false)
    expect(state.boostSpent).toBe(true)
  })

  it('releasing the request ends the burst early', () => {
    let state = stepMany(createInitialFlightState(params), boost(), FIXED_DT, 30)
    state = step(state, input(), FIXED_DT, params)
    expect(state.boosting).toBe(false)
  })

  it('boostCooldown: a new request only fires once the cooldown is over', () => {
    let state = stepMany(createInitialFlightState(params), boost(), FIXED_DT, 30)
    state = stepMany(state, input(), FIXED_DT, 1)
    const cooldownFrames = Math.round(FLIGHT_FEEL.boostCooldown / FIXED_DT)
    state = stepMany(state, input(), FIXED_DT, cooldownFrames - 10)
    state = step(state, boost(), FIXED_DT, params)
    expect(state.boosting).toBe(false)
    state = stepMany(state, input(), FIXED_DT, 20)
    state = step(state, boost(), FIXED_DT, params)
    expect(state.boosting).toBe(true)
  })
})
