import { describe, expect, it } from 'vitest'
import { musicNote } from './music'

describe('seeded flight phrases', () => {
  it('is repeatable, sparse and stays within the chosen pentatonic voice', () => {
    const notes = Array.from({ length: 64 }, (_, i) => musicNote(i))
    expect(notes).toEqual(Array.from({ length: 64 }, (_, i) => musicNote(i)))
    expect(notes.filter(Boolean).length).toBeGreaterThan(25)
    expect(notes.some((note) => note === null)).toBe(true)
    expect(notes.every((note) => !note || (note.frequency >= 220 && note.frequency <= 784))).toBe(
      true,
    )
    expect(new Set(notes.filter(Boolean).map((note) => note!.frequency)).size).toBeGreaterThan(4)
  })
})
