import { DEFAULT_AUDIO_TUNABLES, type EngineWindParams } from './audioParams'
import { createAmbientBed, type AmbientBed } from './bed'
import { emitAudioCaption, type AudioCaptionKey } from './captions'

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
  chug: GainNode
  buzz: GainNode
  whine: GainNode
  engineOsc1: OscillatorNode
  engineOsc2: OscillatorNode
  highOsc: OscillatorNode
  ambient: AmbientBed
  lowRush: GainNode
  windFilter: BiquadFilterNode
  windGain: GainNode
}

let graph: EngineGraph | null = null
let muted = false
let ducked = false

let noiseBuffer: AudioBuffer | null = null
function createLoopingNoise(context: AudioContext): AudioBufferSourceNode {
  if (noiseBuffer) {
    const source = context.createBufferSource()
    source.buffer = noiseBuffer
    source.loop = true
    return source
  }
  const length = Math.floor(context.sampleRate * NOISE_BUFFER_SECONDS)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1

  noiseBuffer = buffer
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

  // Engine: piston chug, detuned mid buzz, and a quieter high whine. Each responds
  // independently to RPM/load instead of raising a single combined oscillator stack.
  const engineOsc1 = context.createOscillator()
  engineOsc1.type = 'sawtooth'
  engineOsc1.frequency.value = DEFAULT_AUDIO_TUNABLES.engineFreqMin
  const engineOsc2 = context.createOscillator()
  engineOsc2.type = 'sawtooth'
  engineOsc2.frequency.value = DEFAULT_AUDIO_TUNABLES.engineFreqMin
  engineOsc2.detune.value = 9
  const engineNoise = createLoopingNoise(context)
  const engineNoiseFilter = context.createBiquadFilter()
  engineNoiseFilter.type = 'lowpass'
  engineNoiseFilter.frequency.value = 230
  const chug = context.createGain()
  const buzz = context.createGain()
  const whine = context.createGain()
  for (const gain of [chug, buzz, whine]) {
    gain.gain.value = 0
    gain.connect(master)
  }
  engineNoise.connect(engineNoiseFilter).connect(chug)
  engineOsc1.connect(buzz)
  engineOsc2.connect(buzz)
  const highOsc = context.createOscillator()
  highOsc.type = 'triangle'
  highOsc.frequency.value = DEFAULT_AUDIO_TUNABLES.engineFreqMin * 3
  highOsc.connect(whine)
  highOsc.start()

  const ambient = createAmbientBed(context, master)

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
  const lowRushNoise = createLoopingNoise(context)
  const lowRushFilter = context.createBiquadFilter()
  lowRushFilter.type = 'lowpass'
  lowRushFilter.frequency.value = 160
  const lowRush = context.createGain()
  lowRush.gain.value = 0
  lowRushNoise.connect(lowRushFilter).connect(lowRush).connect(master)
  lowRushNoise.start()

  return {
    context,
    master,
    cueBus,
    engineOsc1,
    engineOsc2,
    chug,
    buzz,
    whine,
    highOsc,
    ambient,
    lowRush,
    windFilter,
    windGain,
  }
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
  rampTo(graph.highOsc.frequency, params.engineFreq * 3, now, PARAM_RAMP_TIME_CONSTANT)
  rampTo(graph.chug.gain, params.chugGain ?? params.engineGain * 0.4, now, PARAM_RAMP_TIME_CONSTANT)
  rampTo(graph.buzz.gain, params.buzzGain ?? params.engineGain * 0.4, now, PARAM_RAMP_TIME_CONSTANT)
  rampTo(
    graph.whine.gain,
    params.whineGain ?? params.engineGain * 0.1,
    now,
    PARAM_RAMP_TIME_CONSTANT,
  )
  rampTo(graph.lowRush.gain, params.lowRushGain ?? 0, now, PARAM_RAMP_TIME_CONSTANT)
  rampTo(graph.ambient.pad.gain, params.padGain ?? 0, now, GAIN_RAMP_TIME_CONSTANT)
  rampTo(graph.ambient.texture.gain, params.textureGain ?? 0, now, GAIN_RAMP_TIME_CONSTANT)
  rampTo(graph.ambient.pulse.gain, params.pulseGain ?? 0, now, GAIN_RAMP_TIME_CONSTANT)
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
  emitAudioCaption(`audio.${cue}`)
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

/** Lock-in chime partials (Hz): a bright fifth, the second note a beat behind the first. */
const CHIME_PARTIALS = [
  { frequency: 880, delay: 0 },
  { frequency: 1320, delay: 0.09 },
] as const
const CHIME_RELEASE_SECONDS = 0.7

/**
 * The calibration lock-in chime (#63, storyboard frame 03): two ringing sine notes on the cue bus,
 * so it plays at the end of calibration before the engine is up, and only mute silences it.
 */
export function playLockInChime(): void {
  emitAudioCaption('audio.lockIn')
  if (!graph || muted) return
  const { context, cueBus } = graph
  const now = context.currentTime
  for (const { frequency, delay } of CHIME_PARTIALS) {
    const start = now + delay
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = frequency

    const gain = context.createGain()
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(CUE_GAIN, start + CUE_ATTACK_SECONDS)
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + CUE_ATTACK_SECONDS + CHIME_RELEASE_SECONDS,
    )

    osc.connect(gain).connect(cueBus)
    osc.start(start)
    osc.stop(start + CUE_ATTACK_SECONDS + CHIME_RELEASE_SECONDS + 0.02)
  }
}

/** Title swell (#73): an open A-major pad, voiced low to high. */
const SWELL_CHORD_HZ = [110, 164.81, 220, 277.18, 329.63] as const
const SWELL_PEAK_GAIN = 0.07
/** The pad opens from a muffled low-pass to this as it swells, then closes as it releases. */
const SWELL_CUTOFF_HZ = { closed: 300, open: 2400 } as const

export interface SwellTiming {
  /** Seconds from now: the swell begins, peaks and has fully released. */
  start: number
  peak: number
  end: number
}

/**
 * A soft pad that swells under the title reveal, on the cue bus so it never touches the flight
 * mix. Returns whether it was scheduled. It only plays if the page's `AudioContext` is already
 * allowed to run: the title intro starts before any tap, and autoplay policy keeps a context
 * created then suspended on most first visits, so this skips rather than play late.
 */
export function playTitleSwell(timing: SwellTiming): boolean {
  if (muted) return false
  const current = ensureGraph()
  if (!current || current.context.state !== 'running') return false
  applyGains()
  emitAudioCaption('audio.titleSwell')

  const { context, cueBus } = current
  const now = context.currentTime
  const start = now + timing.start
  const peak = now + timing.peak
  const end = now + timing.end

  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.5
  filter.frequency.setValueAtTime(SWELL_CUTOFF_HZ.closed, start)
  filter.frequency.exponentialRampToValueAtTime(SWELL_CUTOFF_HZ.open, peak)
  filter.frequency.exponentialRampToValueAtTime(SWELL_CUTOFF_HZ.closed, end)

  const gain = context.createGain()
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(SWELL_PEAK_GAIN, peak)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)
  filter.connect(gain).connect(cueBus)

  SWELL_CHORD_HZ.forEach((frequency, i) => {
    const osc = context.createOscillator()
    osc.type = i === 0 ? 'triangle' : 'sine'
    osc.frequency.value = frequency
    // Alternate a few cents either side so the pad shimmers instead of sitting dead still.
    osc.detune.value = (i % 2 === 0 ? 1 : -1) * 4
    osc.connect(filter)
    osc.start(start)
    osc.stop(end + 0.05)
  })
  return true
}

/** A filtered noise sweep with a Doppler-shifted pitched layer for landmarks. */
export function playWhoosh(
  kind: 'cloud' | 'landmark' | 'lowPass' | 'ring',
  closingSpeed = 0,
): void {
  const key: AudioCaptionKey =
    kind === 'lowPass'
      ? 'audio.lowPass'
      : kind === 'ring'
        ? 'audio.ring'
        : kind === 'cloud'
          ? 'audio.cloudWhoosh'
          : 'audio.landmarkWhoosh'
  emitAudioCaption(key)
  if (!graph || muted || ducked) return
  const { context, master } = graph
  const now = context.currentTime
  const source = createLoopingNoise(context)
  source.playbackRate.setTargetAtTime(
    Math.max(0.7, Math.min(1.35, (343 + closingSpeed) / 343)),
    now,
    0.03,
  )
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.5
  filter.frequency.setTargetAtTime(kind === 'lowPass' ? 250 : 700, now, 0.04)
  const gain = context.createGain()
  gain.gain.value = 0
  gain.gain.setTargetAtTime(0.23, now, 0.08)
  gain.gain.setTargetAtTime(0, now + 0.2, 0.23)
  source.connect(filter).connect(gain).connect(master)
  if (kind === 'landmark') {
    const tone = context.createOscillator()
    tone.type = 'sine'
    const approach = Math.max(0.7, Math.min(1.35, (343 + closingSpeed) / 343))
    tone.frequency.value = 240 * approach
    tone.frequency.setTargetAtTime(175 / approach, now + 0.18, 0.24)
    const toneGain = context.createGain()
    toneGain.gain.value = 0
    toneGain.gain.setTargetAtTime(0.13, now, 0.08)
    toneGain.gain.setTargetAtTime(0, now + 0.22, 0.24)
    tone.connect(toneGain).connect(master)
    tone.start(now)
    tone.stop(now + 1.6)
    tone.onended = () => {
      tone.disconnect()
      toneGain.disconnect()
    }
  }
  source.start(now)
  source.stop(now + 1.6)
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
  }
}
