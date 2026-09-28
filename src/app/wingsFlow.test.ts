import { describe, expect, it } from 'vitest'
import { createWingsFlow, stepWingsFlow, wingsSpeedProgress } from './wingsFlow'

describe('Wings practice', () => {
  it('requires a continuous half-second past each bank and pitch threshold', () => {
    let flow = createWingsFlow(0)
    flow = stepWingsFlow(flow, -0.4, 0, 100)
    flow = stepWingsFlow(flow, 0, 0, 450)
    expect(flow.step).toBe('left')
    flow = stepWingsFlow(flow, -0.4, 0, 500)
    flow = stepWingsFlow(flow, -0.4, 0, 1000)
    expect(flow.step).toBe('right')
    flow = stepWingsFlow(flow, 0.4, 0, 1100)
    flow = stepWingsFlow(flow, 0.4, 0, 1600)
    expect(flow.step).toBe('climb')
    flow = stepWingsFlow(flow, 0, 0.2, 1700)
    flow = stepWingsFlow(flow, 0, 0.2, 2200)
    expect(flow.step).toBe('dive')
    expect(wingsSpeedProgress(flow, 4200)).toBeCloseTo(0.5)
    flow = stepWingsFlow(flow, 0, -0.2, 2300)
    flow = stepWingsFlow(flow, 0, -0.2, 2800)
    expect(flow.step).toBe('finished')
    expect(stepWingsFlow(flow, 0, 0, 4800).step).toBe('done')
  })

  it('moves on after twenty seconds even when a movement is missed', () => {
    const flow = stepWingsFlow(createWingsFlow(0), 0, 0, 20_000)
    expect(flow.step).toBe('right')
    expect(stepWingsFlow(flow, 0, 0, 40_000).step).toBe('climb')
  })
})
