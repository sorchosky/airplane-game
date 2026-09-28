/** Three quiet procedural stems. All gains feed the pause/mute master bus. */
export interface AmbientBed {
  pad: GainNode
  texture: GainNode
  pulse: GainNode
}

export function createAmbientBed(context: AudioContext, master: AudioNode): AmbientBed {
  const pad = context.createGain()
  const texture = context.createGain()
  const pulse = context.createGain()
  for (const gain of [pad, texture, pulse]) {
    gain.gain.value = 0
    gain.connect(master)
  }

  // Suspended, slowly beating fifth; gains are brought up by flight state.
  for (const [hz, detune] of [
    [110, -4],
    [164.81, 4],
    [220, -2],
  ] as const) {
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = hz
    osc.detune.value = detune
    osc.connect(pad)
    osc.start()
  }

  const shimmer = context.createOscillator()
  shimmer.type = 'triangle'
  shimmer.frequency.value = 880
  const textureFilter = context.createBiquadFilter()
  textureFilter.type = 'lowpass'
  textureFilter.frequency.value = 1100
  shimmer.connect(textureFilter).connect(texture)
  shimmer.start()

  const throb = context.createOscillator()
  throb.type = 'sine'
  throb.frequency.value = 55
  const throbLfo = context.createOscillator()
  throbLfo.type = 'sine'
  throbLfo.frequency.value = 1.3
  const lfoDepth = context.createGain()
  lfoDepth.gain.value = 0.35
  const modulation = context.createGain()
  modulation.gain.value = 0.55
  throbLfo.connect(lfoDepth).connect(modulation.gain)
  throb.connect(modulation).connect(pulse)
  throb.start()
  throbLfo.start()
  return { pad, texture, pulse }
}
