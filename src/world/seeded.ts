// Seeded randomness shared by the terrain's pure modules. Kept in its own leaf module so any of
// them can import it without importing `heightfield.ts`.

/** FNV-1a string hash, used to turn a seed string into a 32-bit PRNG seed. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Mulberry32: tiny seeded PRNG. `simplex-noise` uses it to shuffle its permutation table. */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
