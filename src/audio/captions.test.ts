import { describe, expect, it } from 'vitest'
import { emitAudioCaption, onAudioCaption } from './captions'

describe('audio caption events', () => {
  it('delivers copy keys and stops after unsubscribing', () => {
    const heard: string[] = []
    const stop = onAudioCaption((key) => heard.push(key))
    emitAudioCaption('audio.cloudWhoosh')
    stop()
    emitAudioCaption('audio.ring')
    expect(heard).toEqual(['audio.cloudWhoosh'])
  })
})
