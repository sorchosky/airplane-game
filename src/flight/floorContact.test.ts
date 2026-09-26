import { describe, expect, it } from 'vitest'
import {
  createFloorContactTracker,
  trackFloorContact,
  type FloorContactEvent,
} from './floorContact'

function run(depths: number[]): FloorContactEvent[] {
  const tracker = createFloorContactTracker()
  const events: FloorContactEvent[] = []
  for (const depth of depths) {
    const event = trackFloorContact(tracker, depth)
    if (event) events.push(event)
  }
  return events
}

describe('trackFloorContact', () => {
  it('ignores grazing the top of the band', () => {
    expect(run([0, 0.01, 0.04, 0.03, 0])).toEqual([])
  })

  it('reports a start and an end with the deepest point', () => {
    expect(run([0, 0.1, 0.4, 0.7, 0.3, 0.01, 0])).toEqual([
      { type: 'start', strength: 0.1 },
      { type: 'end', peak: 0.7 },
    ])
  })

  it('does not chatter while hovering between the thresholds', () => {
    expect(run([0.06, 0.03, 0.06, 0.03, 0.04])).toEqual([{ type: 'start', strength: 0.06 }])
  })

  it('starts a fresh contact after the last one ended', () => {
    const events = run([0.2, 0, 0.5, 0])
    expect(events.map((e) => e.type)).toEqual(['start', 'end', 'start', 'end'])
    expect(events[3]).toEqual({ type: 'end', peak: 0.5 })
  })
})
