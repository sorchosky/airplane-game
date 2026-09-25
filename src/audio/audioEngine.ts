import { DEFAULT_AUDIO_TUNABLES, type EngineWindParams } from './audioParams'

/**
 * Procedural engine drone + wind, built once as a persistent Web Audio graph and driven every
 * frame by `useAudioEngine` feeding it `computeAudioParams` output. A module-level singleton
 * (like `pose/cameraService.ts`'s video element) rather than something owned by a component, since
 * only one `AudioContext` should ever exist for the page.
 *
 * Two output buses, both feeding `context.destination`:
 * - `master`  the engine + wind layers. Silenced by either the mute toggle or the pause duck.
 * - `cueBus`  the active/inactive and countdown blips. Silenced only by mute, never by the pause
 *             duck, since the resume countdown has to be audible while the sim is ducked.
 */

/** Time constant for `setTargetAtTime`, not a fixed duration -- the value asymptotically
 * approaches the target. Fast enough to feel responsive to a per-frame caller, slow enough that no
 * single update can be heard as a step. */
const PARAM_RAMP_TIME_CONSTANT = 0.12
/** Slower time constant for mute/duck transitions, so pause and the mute toggle fade rather than snap. */
const GAIN_RAMP_TIME_CONSTANT = 0.25
const MASTER_VOLUME = 0.5
const NOISE_BUFFER_SECONDS = 2
const CUE_GAIN = 0.18
const CUE_ATTACK_SECONDS = 0.015
const CUE_RELEASE_SECONDS = 0.1

interface EngineGraph {
  context: AudioContext
  master: GainNode
  cueBus: GainNode
  engineOsc1: OscillatorNode
  engineOsc2: OscillatorNode
  engineGain: GainNode
  windFilter: BiquadFilterNode
  windGain: GainNode
}

let graph: EngineGraph | null = null
let muted = false
let ducked = false

function createLoopingNoise(context: AudioContext): AudioBufferSourceNode {
  const length = Math.floor(context.sampleRate * NOISE_BUFFER_SECONDS)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1

  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = true
  return source
}

function buildGraph(context: AudioContext): EngineGraph {
  const master = context.createGain()
  master.gain.value = 0
  master.connect(context.destination)

  const cueBus = context.createGain()
  cueBus.gain.value = 0
  cueBus.connect(context.destination)

  // Engine: two slightly detuned sawtooth oscillators (piston buzz) plus low-passed noise (chug),
  // all through one gain stage so `updateAudioParams` only has to drive one number for "effort".
  const engineOsc1 = context.createOscillator()
  engineOsc1.type = 'sawtooth'
  engineOsc1.frequency.value = DEFAULT_AUDIO_TUNABLES.engineFreqMin
  const engineOsc2 = context.createOscillator()
  engineOsc2.type = 'sawtooth'
  engineOsc2.frequency.value = DEFAULT_AUDIO_TUNABLES.engineFreqMin
  engineOsc2.detune.value = 9 // cents; a slight beat gives the drone texture instead of a pure tone

  const engineNoise = createLoopingNoise(context)
  const engineNoiseFilter = context.createBiquadFilter()
  engineNoiseFilter.type = 'lowpass'
  engineNoiseFilter.frequency.value = 250
  const engineNoiseGain = context.createGain()
  engineNoiseGain.gain.value = 0.35 // the chug sits under the oscillators, not over them

  const engineGain = context.createGain()
  engineGain.gain.value = 0
  engineOsc1.connect(engineGain)
  engineOsc2.connect(engineGain)
  engineNoise.connect(engineNoiseFilter).connect(engineNoiseGain).connect(engineGain)
  engineGain.connect(master)

  // Wind: bandpass-filtered noise, gain and cutoff both driven per-frame.
  const windNoise = createLoopingNoise(context)
  const windFilter = context.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.Q.value = 0.7
  windFilter.frequency.value = DEFAULT_AUDIO_TUNABLES.windCutoffMin
  const windGain = context.createGain()
  windGain.gain.value = 0
  windNoise.connect(windFilter).connect(windGain).connect(master)

  engineOsc1.start()
  engineOsc2.start()
  engineNoise.start()
  windNoise.start()

  return { context, master, cueBus, engineOsc1, engineOsc2, engineGain, windFilter, windGain }
}

/** Builds the graph on first use. Feature-detects `AudioContext` (unsupported browsers get no
 * audio, same fail-silently posture as `wakeLock.ts`) and is a no-op once the graph exists. */
function ensureGraph(): EngineGraph | null {
  if (graph) return graph
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null
  graph = buildGraph(new window.AudioContext())
  return graph
}

function rampTo(param: AudioParam, value: number, now: number, timeConstant: number): void {
  param.setTargetAtTime(value, now, timeConstant)
}

function applyGains(): void {
  if (!graph) return
  const now = graph.context.currentTime
  rampTo(graph.master.gain, muted || ducked ? 0 : MASTER_VOLUME, now, GAIN_RAMP_TIME_CONSTANT)
  rampTo(graph.cueBus.gain, muted ? 0 : MASTER_VOLUME, now, GAIN_RAMP_TIME_CONSTANT)
}

/** Creates the (silent) node graph so it's ready the moment `resumeAudioEngine` can unmute it.
 * Safe to call more than once. */
export function initAudioEngine(): void {
  ensureGraph()
}

/**
 * Creates the `AudioContext` if needed and resumes it. Must run from a user-gesture handler (the
 * Start tap) to satisfy autoplay policy; safe to call again on a later Start tap in the same page
 * load, e.g. after quitting to the title screen and starting a new flight.
 */
export async function resumeAudioEngine(): Promise<void> {
  const current = ensureGraph()
  if (!current) return
  if (current.context.state === 'suspended') {
    try {
      await current.context.resume()
    } catch {
      // Autoplay/permission policy can still refuse; the game just plays silently.
    }
  }
  applyGains()
}

/** Applies engine/wind params with a short ramp, so a per-frame caller never clicks. */
export function updateAudioParams(params: EngineWindParams): void {
  if (!graph) return
  const now = graph.context.currentTime
  rampTo(graph.engineOsc1.frequency, params.engineFreq, now, PARAM_RAMP_TIME_CONSTANT)
  rampTo(graph.engineOsc2.frequency, params.engineFreq, now, PARAM_RAMP_TIME_CONSTANT)
  rampTo(graph.engineGain.gain, params.engineGain, now, PARAM_RAMP_TIME_CONSTANT)
  rampTo(graph.windFilter.frequency, params.windCutoff, now, PARAM_RAMP_TIME_CONSTANT)
  rampTo(graph.windGain.gain, params.windGain, now, PARAM_RAMP_TIME_CONSTANT)
}

/** The player's mute toggle (M key / pause menu). Silences everything, cues included. */
export function setMuted(value: boolean): void {
  muted = value
  applyGains()
}

/** Silences the engine/wind while the game is paused, without touching the mute setting so
 * playback resumes exactly as the player left it. Cues stay audible (see module doc). */
export function setDucked(value: boolean): void {
  ducked = value
  applyGains()
}

export type AudioCue = 'engaged' | 'disengaged' | 'countdown'

const CUE_FREQUENCIES: Record<AudioCue, number> = {
  engaged: 660,
  disengaged: 420,
  countdown: 880,
}

/** A short, ramped sine blip -- attack/release envelope, never an instant on/off -- for the
 * active/inactive gesture transition and each resume-countdown tick. */
export function playCue(cue: AudioCue): void {
  if (!graph || muted) return
  const { context, cueBus } = graph
  const now = context.currentTime
  const osc = context.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = CUE_FREQUENCIES[cue]

  const gain = context.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(CUE_GAIN, now + CUE_ATTACK_SECONDS)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + CUE_ATTACK_SECONDS + CUE_RELEASE_SECONDS)

  osc.connect(gain).connect(cueBus)
  osc.start(now)
  osc.stop(now + CUE_ATTACK_SECONDS + CUE_RELEASE_SECONDS + 0.02)
}
