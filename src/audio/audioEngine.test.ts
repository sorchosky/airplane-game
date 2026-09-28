import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('default flight graph', () => {
  it('connects music without restoring the continuous engine or wind noise', () => {
    const source = readFileSync('src/audio/audioEngine.ts', 'utf8')
    expect(source).toContain('createMusic(context, master)')
    expect(source).not.toMatch(/type = 'sawtooth'|engineNoise|windNoise/)
  })
})
