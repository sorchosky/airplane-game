import { Vector3, type BufferGeometry } from 'three'
import { afterAll, describe, expect, it } from 'vitest'
import { NEUTRAL_INPUT, type ControlInput } from '../input/types'
import { DEFAULT_FLIGHT_PARAMS } from './flightModel'
import { buildPlaneGeometry, surfaceId, type ControlSurface } from './planeGeometry'
import {
  NEUTRAL_DEFLECTIONS,
  PLANE_RIG_PARAMS,
  createArticulation,
  dampDeflections,
  propSpinRate,
  showPropDisc,
  targetDeflections,
  turnRate,
} from './planeRig'

const g = DEFAULT_FLIGHT_PARAMS.turnGravity
const cruise = DEFAULT_FLIGHT_PARAMS.cruiseSpeed
const level = { bank: 0, speed: cruise }
const input = (roll: number, pitch: number, active = true): ControlInput => ({
  ...NEUTRAL_INPUT,
  roll,
  pitch,
  active,
})

describe('targetDeflections', () => {
  it('raises the right aileron and drops the left when rolling right', () => {
    const d = targetDeflections(input(1, 0), level, g)
    expect(d.aileronRight).toBeCloseTo(PLANE_RIG_PARAMS.aileronMax)
    expect(d.aileronLeft).toBeCloseTo(-PLANE_RIG_PARAMS.aileronMax)
  })

  it('raises the elevator when climbing and drops it when diving', () => {
    expect(targetDeflections(input(0, 1), level, g).elevatorLeft).toBeGreaterThan(0)
    expect(targetDeflections(input(0, -0.5), level, g).elevatorRight).toBeCloseTo(
      -0.5 * PLANE_RIG_PARAMS.elevatorMax,
    )
  })

  it('swings the rudder slightly into the turn, capped at rudderMax', () => {
    const gentle = targetDeflections(input(0, 0), { bank: 0.2, speed: cruise }, g)
    expect(gentle.rudder).toBeGreaterThan(0)
    expect(gentle.rudder).toBeLessThan(PLANE_RIG_PARAMS.rudderMax)
    const hard = targetDeflections(input(0, 0), { bank: -1.2, speed: cruise }, g)
    expect(hard.rudder).toBeCloseTo(-PLANE_RIG_PARAMS.rudderMax)
  })

  it('centers the stick surfaces when the autopilot has control', () => {
    const d = targetDeflections(input(1, 1, false), level, g)
    expect(d.aileronLeft).toBeCloseTo(0)
    expect(d.aileronRight).toBeCloseTo(0)
    expect(d.elevatorLeft).toBeCloseTo(0)
  })
})

describe('turnRate', () => {
  it('matches the flight model coordinated turn, positive to the right', () => {
    expect(turnRate(Math.PI / 4, cruise, g)).toBeCloseTo(g / cruise)
    expect(turnRate(-0.3, cruise, g)).toBeLessThan(0)
  })
})

describe('dampDeflections', () => {
  it('eases toward the target without overshooting', () => {
    const current = { ...NEUTRAL_DEFLECTIONS }
    const target = { ...NEUTRAL_DEFLECTIONS, rudder: 0.2 }
    dampDeflections(current, target, 1 / 60)
    expect(current.rudder).toBeGreaterThan(0)
    expect(current.rudder).toBeLessThan(0.2)
    for (let i = 0; i < 600; i++) dampDeflections(current, target, 1 / 60)
    expect(current.rudder).toBeCloseTo(0.2)
  })
})

describe('prop', () => {
  it('spins faster with speed, never fast enough to alias at 60 fps', () => {
    expect(propSpinRate(50)).toBeGreaterThan(propSpinRate(35))
    // Two blades look identical every half turn: stay under a quarter turn per frame.
    const revsPerSecond = propSpinRate(DEFAULT_FLIGHT_PARAMS.maxSpeed) / (Math.PI * 2)
    expect(revsPerSecond).toBeLessThan(15)
  })

  it('shows the blur disc at cruise and the blades when slow', () => {
    expect(showPropDisc(cruise, cruise, false)).toBe(true)
    expect(showPropDisc(DEFAULT_FLIGHT_PARAMS.minSpeed, cruise, true)).toBe(false)
  })

  it('does not flicker around the threshold', () => {
    const edge = cruise * PLANE_RIG_PARAMS.discSpeedFraction
    expect(showPropDisc(edge, cruise, true)).toBe(true)
    expect(showPropDisc(edge, cruise, false)).toBe(false)
  })
})

describe('createArticulation', () => {
  const plane = buildPlaneGeometry()
  afterAll(() => plane.dispose())
  const stripe: BufferGeometry = plane.stripe
  const rest = Float32Array.from(stripe.getAttribute('position').array)
  const articulation = createArticulation(stripe, plane.hinges)

  /** The trailing-edge vertex of a surface (largest z), at rest and now. */
  function trailingEdge(surface: ControlSurface): { rest: Vector3; now: Vector3 } {
    const ids = stripe.getAttribute('surface')
    const position = stripe.getAttribute('position')
    let best = -1
    for (let i = 0; i < ids.count; i++) {
      if (ids.getX(i) !== surfaceId(surface)) continue
      if (best < 0 || rest[i * 3 + 2]! > rest[best * 3 + 2]!) best = i
    }
    return {
      rest: new Vector3().fromArray(rest, best * 3),
      now: new Vector3().fromBufferAttribute(position, best),
    }
  }

  it('moves both ailerons trailing edge up for a positive deflection', () => {
    articulation.apply({ ...NEUTRAL_DEFLECTIONS, aileronLeft: 0.3, aileronRight: 0.3 })
    for (const s of ['aileronLeft', 'aileronRight'] as const) {
      const { rest: r, now } = trailingEdge(s)
      expect(now.y).toBeGreaterThan(r.y + 0.05)
    }
  })

  it('moves the elevator halves together and the rudder to the right', () => {
    articulation.apply({
      ...NEUTRAL_DEFLECTIONS,
      elevatorLeft: -0.3,
      elevatorRight: -0.3,
      rudder: 0.3,
    })
    expect(trailingEdge('elevatorLeft').now.y).toBeLessThan(trailingEdge('elevatorLeft').rest.y)
    expect(trailingEdge('elevatorRight').now.y).toBeLessThan(trailingEdge('elevatorRight').rest.y)
    expect(trailingEdge('rudder').now.x).toBeGreaterThan(trailingEdge('rudder').rest.x + 0.05)
  })

  it('leaves static vertices alone and returns exactly to rest at neutral', () => {
    articulation.apply({ ...NEUTRAL_DEFLECTIONS, rudder: 0.4, aileronLeft: -0.2 })
    articulation.apply(NEUTRAL_DEFLECTIONS)
    const now = stripe.getAttribute('position').array
    for (let i = 0; i < rest.length; i++) expect(now[i]).toBeCloseTo(rest[i]!, 5)
  })
})
