/** Seeded, sparse A-minor pentatonic phrases. Pure selection makes the score reproducible. */
const SCALE = [220, 261.63, 293.66, 329.63, 392] as const
const PHRASES = [
  [0, 2, -1, 3, 2, -1, 1, -1],
  [4, -1, 3, 1, -1, 2, 0, -1],
  [2, 1, -1, 0, -1, 3, -1, 4],
  [0, -1, 1, 3, 4, -1, 2, -1],
] as const
const STEP_SECONDS = 0.75

export function musicNote(step: number): { frequency: number; duration: number } | null {
  const phrase = Math.floor(step / 8)
  // Integer hash chooses a phrase and octave without allocating or relying on Math.random.
  let seed = Math.imul(phrase + 17, 0x45d9f3b) >>> 0
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0
  seed = (seed ^ (seed >>> 16)) >>> 0
  const pattern = PHRASES[seed % PHRASES.length]!
  const degree = pattern[step % 8]
  if (degree === undefined || degree < 0) return null
  return { frequency: SCALE.at(degree)! * (seed % 7 === 0 ? 2 : 1), duration: 0.58 }
}

/** Schedules on the audio clock, ahead of playback, independently of the render frame loop. */
export function createMusic(context: AudioContext, master: AudioNode) {
  let timer: number | null = null
  let nextTime = 0
  let step = 0

  const schedule = () => {
    while (nextTime < context.currentTime + 1.2) {
      const note = musicNote(step++)
      if (note) {
        const start = nextTime
        const end = start + note.duration + 1.4
        const gain = context.createGain()
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.linearRampToValueAtTime(0.12, start + 0.035)
        gain.gain.exponentialRampToValueAtTime(0.0001, end)
        gain.connect(master)
        // A soft fundamental and a quiet bell partial, both short lived.
        for (const [multiple, level] of [
          [1, 1],
          [2, 0.13],
        ] as const) {
          const osc = context.createOscillator()
          const partial = context.createGain()
          osc.type = 'sine'
          osc.frequency.value = note.frequency * multiple
          partial.gain.value = level
          osc.connect(partial).connect(gain)
          osc.start(start)
          osc.stop(end + 0.05)
          osc.onended = () => {
            osc.disconnect()
            partial.disconnect()
            if (multiple === 2) gain.disconnect()
          }
        }
      }
      nextTime += STEP_SECONDS
    }
  }

  return {
    setPlaying(playing: boolean) {
      if (playing && timer === null) {
        nextTime = context.currentTime + 0.05
        schedule()
        timer = window.setInterval(schedule, 250)
      } else if (!playing && timer !== null) {
        window.clearInterval(timer)
        timer = null
      }
    },
  }
}
