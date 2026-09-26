import { Vector3 } from 'three'
import { create } from 'zustand'
import type { ControlInput } from '../input/types'
import { findSpawnPoint } from '../world/heightfield'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import {
  DEFAULT_FLIGHT_PARAMS,
  createInitialFlightState,
  step,
  type FlightParams,
  type FlightState,
} from './flightModel'
import {
  createFloorContactTracker,
  trackFloorContact,
  type FloorContactEvent,
} from './floorContact'

/** m above the valley floor the plane starts at */
const SPAWN_ALTITUDE = 120

let spawn: Vector3 | null = null

/** Over a valley near the origin. Searched once (a few ms) and cached; the seed never changes. */
function spawnPosition(): Vector3 {
  if (!spawn) {
    const point = findSpawnPoint(TERRAIN_CONFIG)
    spawn = new Vector3(point.x, point.groundHeight + SPAWN_ALTITUDE, point.z)
  }
  return spawn
}

type FloorContactListener = (event: FloorContactEvent) => void
const floorContactListeners = new Set<FloorContactListener>()
const floorContact = createFloorContactTracker()

/**
 * Low-pass payoff hook (#68): called when the plane dips into the soft floor (`start`, with its
 * depth) and when it climbs back out (`end`, with the deepest point). For VFX and audio (F2, F3);
 * the continuous depth is `state.floorContact`. Returns the unsubscribe function.
 */
export function onFloorContact(listener: FloorContactListener): () => void {
  floorContactListeners.add(listener)
  return () => floorContactListeners.delete(listener)
}

interface FlightStore {
  state: FlightState
  params: FlightParams
  /**
   * Advances the simulation. Called once per frame from `Plane`'s `useFrame`. `groundHeight` is
   * the terrain height under the plane, for the soft floor.
   */
  tick: (input: ControlInput, dt: number, groundHeight: number) => void
  reset: () => void
}

// Frame-rate values live here, not in React state -- read via `useFlightStore.getState()` inside
// `useFrame` (camera, HUD, audio), not via the `useFlightStore()` hook, which would re-render on
// every tick. `tick` steps the state object in place and does not call `set`: the object's
// identity never changes, so nothing allocates per frame and nothing can subscribe to it as
// React state (`reset` does go through `set`, so a subscriber would only see resets).
export const useFlightStore = create<FlightStore>((set, get) => ({
  state: createInitialFlightState(DEFAULT_FLIGHT_PARAMS, spawnPosition()),
  params: DEFAULT_FLIGHT_PARAMS,
  tick: (input, dt, groundHeight) => {
    const { state, params } = get()
    step(state, input, dt, params, groundHeight, state)
    const event = trackFloorContact(floorContact, state.floorContact)
    if (event) for (const listener of floorContactListeners) listener(event)
  },
  reset: () => set({ state: createInitialFlightState(get().params, spawnPosition()) }),
}))
