import { Vector3 } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import type { ControlInput } from '../input/types'
import type { FloorContactEvent } from './floorContact'
import { onFloorContact, useFlightStore } from './flightStore'

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
