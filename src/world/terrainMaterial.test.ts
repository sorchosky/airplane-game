import { describe, expect, it } from 'vitest'
import { TERRAIN_CONFIG } from './terrainConfig'
import { cellsPerPeriod, terrainColorGlsl, terrainNoiseFrequencies } from './terrainMaterial'

describe('terrain colour noise on a wrapping world (#176)', () => {
  const P = TERRAIN_CONFIG.worldPeriod
  const b = TERRAIN_CONFIG.bands

  it('fits a whole number of lattice cells into the period for every layer', () => {
    for (const frequency of Object.values(terrainNoiseFrequencies(TERRAIN_CONFIG))) {
      expect(frequency * P).toBeCloseTo(cellsPerPeriod(frequency, P), 6)
    }
  })

  it('keeps every layer within 2% of its tuned feature size', () => {
    const f = terrainNoiseFrequencies(TERRAIN_CONFIG)
    const near = (frequency: number, scale: number) =>
      expect(Math.abs(frequency * scale - 1)).toBeLessThan(0.02)
    near(f.color, b.noiseScale)
    near(f.colorFine, b.noiseScale / 2.3)
    near(f.macro, b.macroScale)
    near(f.macroFine, b.macroScale / 1.7)
    near(f.brush, b.brushScale)
  })

  it('writes the periods into the shader', () => {
    const glsl = terrainColorGlsl(TERRAIN_CONFIG)
    const f = terrainNoiseFrequencies(TERRAIN_CONFIG)
    expect(glsl).toContain(`vec2(${cellsPerPeriod(f.color, P).toFixed(5)})`)
    expect(glsl).toContain('mod(i, period)')
  })
})
