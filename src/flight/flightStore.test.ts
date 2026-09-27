import { Vector3 } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import type { ControlInput } from '../input/types'
import type { FloorContactEvent } from './floorContact'
import { onBoost, onFloorContact, useFlightStore, type BoostEvent } from './flightStore'

const LEVEL: ControlInput = { roll: 0, pitch: 0, active: true, confidence: 1, source: 'keyboard' }

afterEach(() => useFlightStore.getState().reset())

describe('onFloorContact', () => {
  it('fires start on a low pass and end, with the peak, on climbing out', () => {
    const events: FloorContactEvent[] = []
    const unsubscribe = onFloorContact((event) => events.push(event))
    const store = useFlightStore.getState()
    const ground = 100

    store.state.position.copy(new Vector3(0, 108, 0)) // 8 m up a 20 m band
    store.tick(LEVEL, 1 / 60, ground)
    expect(events).toEqual([{ type: 'start', strength: expect.any(Number) }])

    store.state.position.copy(new Vector3(0, 300, 0))
    store.tick(LEVEL, 1 / 60, ground)
    expect(events[1]).toMatchObject({ type: 'end' })
    expect((events[1] as { peak: number }).peak).toBeGreaterThan(0.5)

    unsubscribe()
    store.state.position.copy(new Vector3(0, 105, 0))
    store.tick(LEVEL, 1 / 60, ground)
    expect(events).toHaveLength(2)
  })
})

describe('onBoost', () => {
  it('fires start when a burst begins and end, with its length, when it stops', () => {
    const events: BoostEvent[] = []
    const unsubscribe = onBoost((event) => events.push(event))
    const store = useFlightStore.getState()
    const boosting: ControlInput = { ...LEVEL, boost: true }

    store.tick(LEVEL, 1 / 60, -Infinity)
    expect(events).toEqual([])
    store.tick(boosting, 1 / 60, -Infinity)
    expect(events).toEqual([{ type: 'start' }])
    for (let i = 0; i < 29; i++) store.tick(boosting, 1 / 60, -Infinity)
    expect(events).toHaveLength(1)
    store.tick(LEVEL, 1 / 60, -Infinity)
    expect(events[1]).toEqual({ type: 'end', duration: expect.closeTo(0.5, 5) })

    unsubscribe()
  })
})
