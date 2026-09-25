import { create } from 'zustand'
import type { ControlInput } from '../input/types'
import {
  DEFAULT_FLIGHT_PARAMS,
  createInitialFlightState,
  step,
  type FlightParams,
  type FlightState,
} from './flightModel'

interface FlightStore {
  state: FlightState
  params: FlightParams
  /** Advances the simulation. Called once per frame from `Plane`'s `useFrame`. */
  tick: (input: ControlInput, dt: number) => void
  reset: () => void
}

// Frame-rate values live here, not in React state -- read via `useFlightStore.getState()` inside
// `useFrame` (camera, HUD, audio), not via the `useFlightStore()` hook, which would re-render on
// every tick.
export const useFlightStore = create<FlightStore>((set, get) => ({
  state: createInitialFlightState(DEFAULT_FLIGHT_PARAMS),
  params: DEFAULT_FLIGHT_PARAMS,
  tick: (input, dt) => {
    const { state, params } = get()
    set({ state: step(state, input, dt, params) })
  },
  reset: () => set({ state: createInitialFlightState(get().params) }),
}))
