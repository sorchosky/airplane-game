import { expect, it } from 'vitest'
import { createRollStability, updateRollStability } from './inputReadoutMath'

it('hides after 20 seconds steady, returns on erratic banking or a dropped gate', () => {
  const state = createRollStability()
  for (let t = 100; t <= 20_200; t += 100) updateRollStability(state, 0, true, t)
  expect(updateRollStability(state, 0, true, 20_300)).toBe(false)
  for (let t = 20_400; t <= 21_400; t += 100)
    updateRollStability(state, t % 200 === 0 ? 1 : -1, true, t)
  expect(updateRollStability(state, 0, true, 21_500)).toBe(true)
  expect(updateRollStability(state, 0, false, 45_000)).toBe(true)
})
