import { Vector3 } from 'three'
import { create } from 'zustand'
import type { ControlInput } from '../input/types'
import { findSpawnPoint } from '../world/heightfield'
import { TERRAIN_CONFIG } from '../world/terrainConfig'
import { wrapPosition, type WrapShift } from '../world/wrap'
import {
  DEFAULT_FLIGHT_PARAMS,
  createInitialFlightState,
  step,
  type FlightParams,
  type FlightState,
} from './flightModel'
import {
  autopilotInput,
  flightStateFromFlyby,
  flybyHandoff,
  levelledOff,
  withinHandoffEnvelope,
} from './flybyHandoff'
import {
  createFloorContactTracker,
  trackFloorContact,
  type FloorContactEvent,
} from './floorContact'

/** m above the valley floor the plane starts at */
const SPAWN_ALTITUDE = 120

/**
 * The most simulated time one `tick` may carry, in seconds. A frame's delta can be absurd: on the
 * frame the 30 fps cap turns on, R3F's last uncapped loop tick reports its millisecond timestamp
 * as seconds (hours of flight). Past this, time is dropped: the plane holds course instead of
 * jumping kilometres, and `groundHeight`, sampled once per tick, stays under the plane.
 */
export const MAX_TICK_DT = 0.25

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

/** `end` carries how long the burst ran (s): cut short by the player, or the full `boostDuration`. */
export type BoostEvent = { type: 'start' } | { type: 'end'; duration: number }

type BoostListener = (event: BoostEvent) => void
const boostListeners = new Set<BoostListener>()
const BOOST_START: BoostEvent = { type: 'start' }

/**
 * Boost payoff hook (#93): called when an arms-back boost burst starts and when it ends. For VFX
 * and audio (F2, F3); the live flag is `state.boosting`. Returns the unsubscribe function.
 */
export function onBoost(listener: BoostListener): () => void {
  boostListeners.add(listener)
  return () => boostListeners.delete(listener)
}

type WorldWrapListener = (shift: WrapShift) => void
const worldWrapListeners = new Set<WorldWrapListener>()
const wrapShift: WrapShift = { x: 0, z: 0 }

/**
 * Wrapping world hook (#177): called in the same frame the plane's position moves by a whole
 * world period (`wrapWorld`), with that move. Anything that keeps world positions from earlier
 * frames (camera springs, trails, a last position) adds the move to them. The shift object is
 * reused; copy what you need. Returns the unsubscribe function.
 */
export function onWorldWrap(listener: WorldWrapListener): () => void {
  worldWrapListeners.add(listener)
  return () => worldWrapListeners.delete(listener)
}

/**
 * Keeps the plane inside [-P/2, P/2) on x and z, P = `TERRAIN_CONFIG.worldPeriod`: when it has
 * flown out of one side it moves a whole period to the other, where the world is the same, and
 * every `onWorldWrap` listener moves with it. Runs once at the start of each frame (`WorldWrap`),
 * before anything reads the plane, so a frame never mixes positions from both sides of the seam.
 * Returns whether the plane moved.
 */
export function wrapWorld(): boolean {
  const { state } = useFlightStore.getState()
  if (!wrapPosition(state.position, TERRAIN_CONFIG.worldPeriod, wrapShift)) return false
  for (const listener of worldWrapListeners) listener(wrapShift)
  return true
}

// The input the sim flies on while it levels off after a hand-off; written in place each tick.
const levelOffInput: ControlInput = {
  roll: 0,
  pitch: 0,
  active: false,
  confidence: 1,
  source: 'keyboard',
}

interface FlightStore {
  state: FlightState
  params: FlightParams
  /**
   * The plane was handed over outside the autopilot's safe envelope (#161): the sim flies with
   * `active: false` until it has levelled off, then the player's input takes over.
   */
  levellingOff: boolean
  /**
   * Advances the simulation. Called once per frame from `Plane`'s `useFrame`. `groundHeight` is
   * the terrain height under the plane, for the soft floor.
   */
  tick: (input: ControlInput, dt: number, groundHeight: number) => void
  /** Keeps Wings at a gentle glide, then ramps the last prompt into cruise. */
  setPracticeProgress: (progress: number | null) => void
  reset: () => void
  /**
   * Flight begins from the title flyby (#161): the sim takes over the scripted plane where it was
   * last drawn, levelling off first if that pose is outside the safe envelope. `groundHeight` is
   * the terrain height under the plane. Falls back to `reset` when the flyby never drew.
   */
  takeOverFromFlyby: (groundHeight: number) => void
}

// Frame-rate values live here, not in React state -- read via `useFlightStore.getState()` inside
// `useFrame` (camera, HUD, audio), not via the `useFlightStore()` hook, which would re-render on
// every tick. `tick` steps the state object in place and does not call `set`: the object's
// identity never changes, so nothing allocates per frame and nothing can subscribe to it as
// React state (`reset` does go through `set`, so a subscriber would only see resets).
export const useFlightStore = create<FlightStore>((set, get) => ({
  state: createInitialFlightState(DEFAULT_FLIGHT_PARAMS, spawnPosition()),
  params: DEFAULT_FLIGHT_PARAMS,
  levellingOff: false,
  setPracticeProgress: (progress) => {
    if (progress === null) {
      set({ params: DEFAULT_FLIGHT_PARAMS })
      return
    }
    const fraction = Math.max(0, Math.min(1, progress))
    const target = DEFAULT_FLIGHT_PARAMS.cruiseSpeed * (0.45 + 0.55 * fraction)
    // A separate params object leaves the normal flight tuning untouched.
    const params =
      get().params === DEFAULT_FLIGHT_PARAMS
        ? {
            ...DEFAULT_FLIGHT_PARAMS,
            minSpeed: DEFAULT_FLIGHT_PARAMS.cruiseSpeed * 0.45,
            floorPitchBias: 0,
          }
        : get().params
    params.cruiseSpeed = target
    if (get().params !== params) set({ params })
  },
  tick: (input, dt, groundHeight) => {
    const { state, params, levellingOff } = get()
    const wasBoosting = state.boosting
    const boostTime = state.boostTime
    const flown = levellingOff ? autopilotInput(input, levelOffInput) : input
    step(state, flown, Math.min(Math.max(dt, 0), MAX_TICK_DT), params, groundHeight, state)
    // Flips once per hand-off, so it can go through `set`.
    if (levellingOff && levelledOff(state)) set({ levellingOff: false })
    const event = trackFloorContact(floorContact, state.floorContact)
    if (event) for (const listener of floorContactListeners) listener(event)
    if (state.boosting !== wasBoosting) {
      const boostEvent: BoostEvent = state.boosting
        ? BOOST_START
        : { type: 'end', duration: boostTime }
      for (const listener of boostListeners) listener(boostEvent)
    }
  },
  reset: () =>
    set({ state: createInitialFlightState(get().params, spawnPosition()), levellingOff: false }),
  takeOverFromFlyby: (groundHeight) => {
    if (!flybyHandoff.planeValid) {
      get().reset()
      return
    }
    const { state, params } = get()
    flightStateFromFlyby(flybyHandoff.pose, params, state)
    set({ levellingOff: !withinHandoffEnvelope(state, groundHeight, params) })
  },
}))
