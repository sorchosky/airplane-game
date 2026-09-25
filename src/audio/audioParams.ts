/**
 * Pure mapping from flight state to procedural engine/wind audio params. No Web Audio or React
 * here — `audioEngine.ts` applies these numbers to the actual node graph, which keeps this file
 * trivially unit-testable.
 *
 * Kept as a narrow, flat interface (plain numbers, no `Vector3`/`Quaternion`) rather than importing
 * `FlightState`/`FlightParams` directly, so a test doesn't need to construct a real flight state —
 * `flightStore.state`/`flightStore.params` satisfy `FlightAudioInput`/`FlightAudioRange`
 * structurally.
 */
export interface FlightAudioInput {
  speed: number // m/s
  pitchAngle: number // radians, positive = nose up
  bank: number // radians, positive = banking right
}

export interface FlightAudioRange {
  minSpeed: number
  maxSpeed: number
  maxBankAngle: number
}

export interface EngineWindParams {
  /** Hz, fundamental frequency of the engine oscillator stack. */
  engineFreq: number
  /** 0..1, engine layer gain before the master bus. */
  engineGain: number
  /** Hz, wind bandpass filter center frequency. */
  windCutoff: number
  /** 0..1, wind layer gain before the master bus. */
  windGain: number
}

export interface AudioTunables {
  engineFreqMin: number
  engineFreqMax: number
  engineGainMin: number
  engineGainMax: number
  windCutoffMin: number
  windCutoffMax: number
  windGainMin: number
  windGainMax: number
  /** How much climbing (vs. airspeed alone) drives engine gain, 0..1. */
  climbWeight: number
  /** How much bank (vs. airspeed alone) drives the wind layer, 0..1. */
  bankWeight: number
}

export const DEFAULT_AUDIO_TUNABLES: AudioTunables = {
  engineFreqMin: 70,
  engineFreqMax: 160,
  engineGainMin: 0.18,
  engineGainMax: 0.4,
  windCutoffMin: 500,
  windCutoffMax: 3200,
  windGainMin: 0.03,
  windGainMax: 0.28,
  climbWeight: 0.4,
  bankWeight: 0.5,
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
const lerp = (min: number, max: number, t: number): number => min + (max - min) * t

/**
 * Engine pitch tracks airspeed alone (a dive picks up speed and the prop free-wheels faster, so
 * the engine note rises in a dive even though the pilot isn't climbing). Engine gain blends
 * airspeed with climb effort (`sin(pitchAngle)`, floored at 0 so diving never reads as harder work
 * than level flight) since climbing needs more power. Wind gain/cutoff blend airspeed with bank
 * angle, since a hard turn digs the airframe deeper into the airstream.
 */
export function computeAudioParams(
  flight: FlightAudioInput,
  range: FlightAudioRange,
  tunables: AudioTunables = DEFAULT_AUDIO_TUNABLES,
): EngineWindParams {
  const speedSpan = Math.max(1e-6, range.maxSpeed - range.minSpeed)
  const normSpeed = clamp01((flight.speed - range.minSpeed) / speedSpan)
  const climbFactor = clamp01(Math.sin(flight.pitchAngle))
  const normBank = clamp01(Math.abs(flight.bank) / Math.max(1e-6, range.maxBankAngle))

  const gainBlend = clamp01(
    (1 - tunables.climbWeight) * normSpeed + tunables.climbWeight * climbFactor,
  )
  const windBlend = clamp01((1 - tunables.bankWeight) * normSpeed + tunables.bankWeight * normBank)

  return {
    engineFreq: lerp(tunables.engineFreqMin, tunables.engineFreqMax, normSpeed),
    engineGain: lerp(tunables.engineGainMin, tunables.engineGainMax, gainBlend),
    windCutoff: lerp(tunables.windCutoffMin, tunables.windCutoffMax, windBlend),
    windGain: lerp(tunables.windGainMin, tunables.windGainMax, windBlend),
  }
}
