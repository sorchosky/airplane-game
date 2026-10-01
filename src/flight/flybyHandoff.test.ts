import { Vector3 } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import type { ControlInput } from '../input/types'
import { fromHeadingFrame } from './cameraMath'
import { DEFAULT_FLIGHT_PARAMS, FIXED_DT, createInitialFlightState, step } from './flightModel'
import { useFlightStore } from './flightStore'
import {
  autopilotInput,
  flightStateFromFlyby,
  flybyHandoff,
  levelledOff,
  recordTitleCamera,
  withinHandoffEnvelope,
} from './flybyHandoff'
import { TITLE_FLYBY, createTitleFlybyPose, titleFlyby } from './titleFlyby'

const IDLE: ControlInput = { roll: 0, pitch: 0, active: true, confidence: 1, source: 'keyboard' }
const params = DEFAULT_FLIGHT_PARAMS
/** Well below the loop's altitude, so the soft floor plays no part. */
const GROUND = 0

afterEach(() => {
  flybyHandoff.planeValid = false
  flybyHandoff.cameraValid = false
  useFlightStore.getState().reset()
})

describe('flightStateFromFlyby', () => {
  it('takes the flyby pose, and the first sim step stays within 0.5 m of the flyby', () => {
    // Every few seconds round the loop, so straights and the tightest turns are both covered.
    for (let t = 0; t < TITLE_FLYBY.period; t += 3) {
      const pose = titleFlyby(t, 0, createTitleFlybyPose())
      const state = flightStateFromFlyby(pose, params, createInitialFlightState(params))
      expect(state.position.distanceTo(pose.position)).toBe(0)
      expect(state.heading).toBe(pose.heading)
      expect(state.bank).toBe(pose.bank)
      expect(state.speed).toBeCloseTo(pose.speed, 9)

      step(state, IDLE, FIXED_DT, params, GROUND, state)
      const next = titleFlyby(t + FIXED_DT, 0, createTitleFlybyPose())
      expect(state.position.distanceTo(next.position)).toBeLessThan(0.5)
    }
  })

  it('carries the flyby velocity: heading and speed match the script', () => {
    const pose = titleFlyby(10, 0, createTitleFlybyPose())
    const after = titleFlyby(10 + 0.01, 0, createTitleFlybyPose())
    const velocity = after.position.clone().sub(pose.position).divideScalar(0.01)
    const state = flightStateFromFlyby(pose, params, createInitialFlightState(params))
    const forward = new Vector3(-Math.sin(state.heading), 0, -Math.cos(state.heading))
    const horizontal = new Vector3(velocity.x, 0, velocity.z)
    expect(horizontal.clone().normalize().dot(forward)).toBeCloseTo(1, 3)
    expect(velocity.length()).toBeCloseTo(state.speed, 0)
  })

  it('starts every other field clear', () => {
    const dirty = createInitialFlightState(params)
    dirty.boosting = true
    dirty.boostTime = 2
    dirty.boostCooldown = 3
    dirty.boostSpent = true
    dirty.floorContact = 0.7
    dirty.pitchRate = 4
    const state = flightStateFromFlyby(titleFlyby(5, 0, createTitleFlybyPose()), params, dirty)
    expect(state).toMatchObject({
      boosting: false,
      boostTime: 0,
      boostCooldown: 0,
      boostSpent: false,
      floorContact: 0,
      pitchRate: 0,
    })
    expect(state.yawBank).toBe(state.bank)
  })
})

describe('withinHandoffEnvelope', () => {
  const at = (bank: number, pitch: number, height: number) => {
    const state = createInitialFlightState(params, new Vector3(0, height, 0))
    state.bank = bank
    state.pitchAngle = pitch
    return state
  }

  it('accepts the whole title loop', () => {
    for (let t = 0; t < TITLE_FLYBY.period; t += 1) {
      const pose = titleFlyby(t, 0, createTitleFlybyPose())
      const state = flightStateFromFlyby(pose, params, createInitialFlightState(params))
      expect(withinHandoffEnvelope(state, GROUND, params)).toBe(true)
    }
  })

  it('rejects a steep bank, a steep pitch, or a pose close to the ground', () => {
    expect(withinHandoffEnvelope(at(0.2, 0, 150), GROUND, params)).toBe(true)
    expect(withinHandoffEnvelope(at(1, 0, 150), GROUND, params)).toBe(false)
    expect(withinHandoffEnvelope(at(-1, 0, 150), GROUND, params)).toBe(false)
    expect(withinHandoffEnvelope(at(0, 0.5, 150), GROUND, params)).toBe(false)
    expect(withinHandoffEnvelope(at(0, 0, 150), 130, params)).toBe(false)
  })

  it('counts a level-off as done once bank and pitch are near level', () => {
    expect(levelledOff(at(0.02, 0.01, 150))).toBe(true)
    expect(levelledOff(at(0.3, 0, 150))).toBe(false)
  })
})

describe('autopilotInput', () => {
  it('turns the input off and keeps its source and confidence', () => {
    const out = { ...IDLE }
    autopilotInput({ ...IDLE, roll: 1, pitch: -1, boost: true, confidence: 0.4 }, out)
    expect(out).toEqual({
      roll: 0,
      pitch: 0,
      active: false,
      boost: false,
      confidence: 0.4,
      source: 'keyboard',
    })
  })
})

describe('recordTitleCamera', () => {
  it('stores the camera relative to the plane, so it can be placed again from the plane', () => {
    const pose = titleFlyby(12, 1, createTitleFlybyPose())
    recordTitleCamera(pose, 60)
    expect(flybyHandoff.cameraValid).toBe(true)
    const placed = fromHeadingFrame(flybyHandoff.cameraOffset, pose.heading).add(pose.position)
    expect(placed.distanceTo(pose.cameraPosition)).toBeLessThan(1e-9)
  })
})

describe('useFlightStore.takeOverFromFlyby', () => {
  const ROLL_RIGHT: ControlInput = { ...IDLE, roll: 1 }

  it('falls back to the spawn when the flyby never drew', () => {
    const spawn = useFlightStore.getState().state.position.clone()
    useFlightStore.getState().state.position.set(1, 2, 3)
    useFlightStore.getState().takeOverFromFlyby(GROUND)
    expect(useFlightStore.getState().state.position.distanceTo(spawn)).toBe(0)
  })

  it('hands a pose inside the envelope straight to the player', () => {
    titleFlyby(8, 0, flybyHandoff.pose)
    flybyHandoff.planeValid = true
    const store = useFlightStore.getState()
    store.takeOverFromFlyby(GROUND)
    expect(useFlightStore.getState().levellingOff).toBe(false)
    expect(store.state.position.distanceTo(flybyHandoff.pose.position)).toBe(0)
    const bank = store.state.bank
    store.tick(ROLL_RIGHT, 0.2, GROUND)
    expect(store.state.bank).toBeGreaterThan(bank)
  })

  it('outside the envelope, flies on autopilot until level, then gives the stick back', () => {
    titleFlyby(8, 0, flybyHandoff.pose)
    flybyHandoff.pose.bank = 1.2
    flybyHandoff.pose.bankRate = 0
    flybyHandoff.planeValid = true
    const store = useFlightStore.getState()
    store.takeOverFromFlyby(GROUND)
    expect(useFlightStore.getState().levellingOff).toBe(true)

    // Full right roll is ignored: the bank comes down toward level instead.
    store.tick(ROLL_RIGHT, 0.1, GROUND)
    expect(store.state.bank).toBeLessThan(1.2)
    for (let i = 0; i < 300 && useFlightStore.getState().levellingOff; i++) {
      store.tick(ROLL_RIGHT, FIXED_DT, GROUND)
    }
    expect(useFlightStore.getState().levellingOff).toBe(false)
    expect(levelledOff(store.state)).toBe(true)

    // Now the player's roll applies.
    const bank = store.state.bank
    store.tick(ROLL_RIGHT, 0.2, GROUND)
    expect(store.state.bank).toBeGreaterThan(bank)
  })
})
