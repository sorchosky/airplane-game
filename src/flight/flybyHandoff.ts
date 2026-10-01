import { Vector3 } from 'three'
import type { ControlInput } from '../input/types'
import type { FlightParams, FlightState } from './flightModel'
import { toHeadingFrame } from './cameraMath'
import { createTitleFlybyPose, type TitleFlybyPose } from './titleFlyby'

/**
 * The title flyby → flight hand-off (#161). Flight begins from wherever the scripted plane is:
 * the sim takes over its pose, and the chase camera glides in from the title camera's framing.
 * Pure: plain TS over Three math types.
 */

/**
 * The flyby as last drawn: the scripted plane's pose, and where the title camera was relative to
 * it, in the plane's heading frame ([right, up, forward] in x, y, z). The scripted plane and the
 * title camera write it every frame they draw; flight reads it once as it takes over. One per
 * page: there is only ever one flyby.
 */
export interface FlybyHandoff {
  /** The scripted plane's pose; `planeValid` once it has been written. */
  pose: TitleFlybyPose
  planeValid: boolean
  cameraValid: boolean
  cameraOffset: Vector3
  cameraLookOffset: Vector3
  fov: number
}

export const flybyHandoff: FlybyHandoff = {
  pose: createTitleFlybyPose(),
  planeValid: false,
  cameraValid: false,
  cameraOffset: new Vector3(),
  cameraLookOffset: new Vector3(),
  fov: 60,
}

/** Records the title camera's pose relative to the flyby plane. Allocates nothing. */
export function recordTitleCamera(pose: TitleFlybyPose, fov: number, record = flybyHandoff): void {
  const offset = record.cameraOffset.copy(pose.cameraPosition).sub(pose.position)
  toHeadingFrame(offset, pose.heading, offset)
  const look = record.cameraLookOffset.copy(pose.cameraLookAt).sub(pose.position)
  toHeadingFrame(look, pose.heading, look)
  record.fov = fov
  record.cameraValid = true
}

/**
 * Hands the flyby's pose to the sim: position, orientation, heading, bank, pitch and speed as the
 * scripted plane had them, with the bank rate seeding the bank spring and the turn following the
 * current bank (no lag to catch up). Everything else (boost, floor contact) starts clear. Writes
 * into `out`, which may already hold the flyby's pose (the scripted plane writes the store).
 */
export function flightStateFromFlyby(
  pose: TitleFlybyPose,
  params: FlightParams,
  out: FlightState,
): FlightState {
  out.position.copy(pose.position)
  out.orientation.copy(pose.orientation)
  out.bank = pose.bank
  out.bankRate = pose.bankRate
  out.yawBank = pose.bank
  out.heading = pose.heading
  out.pitchAngle = pose.pitchAngle
  out.pitchRate = 0
  out.speed = Math.min(Math.max(pose.speed, params.minSpeed), params.maxSpeed)
  out.floorContact = 0
  out.boosting = false
  out.boostTime = 0
  out.boostCooldown = 0
  out.boostSpent = false
  return out
}

/**
 * The attitudes the autopilot can hand straight to the player. Outside them the sim levels off
 * first. The flyby's loop stays well inside (25° bank, ~1° pitch, 150 m up).
 */
export const HANDOFF_ENVELOPE = {
  /** rad, steepest bank handed over as is. */
  maxBank: (35 * Math.PI) / 180,
  /** rad, steepest climb or dive handed over as is. */
  maxPitch: (12 * Math.PI) / 180,
  /** Height above ground, as a multiple of the soft floor's band, below which it levels first. */
  minClearanceBands: 2,
  /** rad, the bank and pitch the level-off holds out for before the player gets the stick. */
  levelBank: (5 * Math.PI) / 180,
  levelPitch: (4 * Math.PI) / 180,
} as const

/** Whether the plane can be handed to the player as it is, without levelling off first. */
export function withinHandoffEnvelope(
  state: FlightState,
  groundHeight: number,
  params: FlightParams,
): boolean {
  return (
    Math.abs(state.bank) <= HANDOFF_ENVELOPE.maxBank &&
    Math.abs(state.pitchAngle) <= HANDOFF_ENVELOPE.maxPitch &&
    state.position.y - groundHeight >= params.floorClearance * HANDOFF_ENVELOPE.minClearanceBands &&
    state.speed >= params.minSpeed &&
    state.speed <= params.maxSpeed
  )
}

/** Whether a level-off has settled enough to give the player the stick. */
export function levelledOff(state: FlightState): boolean {
  return (
    Math.abs(state.bank) <= HANDOFF_ENVELOPE.levelBank &&
    Math.abs(state.pitchAngle) <= HANDOFF_ENVELOPE.levelPitch
  )
}

/**
 * The input the sim flies on while it levels off: the player's, with `active` off so the
 * autopilot's level targets apply. Written into `out` (no allocation).
 */
export function autopilotInput(input: ControlInput, out: ControlInput): ControlInput {
  out.roll = 0
  out.pitch = 0
  out.active = false
  out.boost = false
  out.confidence = input.confidence
  out.source = input.source
  return out
}
