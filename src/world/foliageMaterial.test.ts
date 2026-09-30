import { describe, expect, it } from 'vitest'
import { color } from '../styles/tokens'
import {
  createFoliageBodyMaterial,
  createFoliageHullMaterial,
  FOLIAGE_OUTLINE,
} from './foliageMaterial'
import { TERRAIN_CONFIG } from './terrainConfig'

describe('foliage materials', () => {
  it('keeps the body free of the broad camera-facing rim term', () => {
    const material = createFoliageBodyMaterial(900, 1500)
    expect(material.customProgramCacheKey()).toBe('foliage-body-no-rim')
    expect(material.onBeforeCompile.toString()).not.toContain('injectRimLight')
    material.dispose()
  })

  it('uses restrained landscape-specific linework', () => {
    const material = createFoliageHullMaterial(900, 1500, TERRAIN_CONFIG.foliage)
    expect(material.uniforms.color?.value.getHexString()).toBe(color.foliageOutline.slice(1))
    expect(FOLIAGE_OUTLINE.maxPixels).toBeLessThan(2)
    expect(FOLIAGE_OUTLINE.thickness).toBeLessThan(0.35)
    material.dispose()
  })

  it('uses an inverse-transpose instance normal so nonuniform scales stay attached', () => {
    const material = createFoliageHullMaterial(900, 1500, TERRAIN_CONFIG.foliage)
    expect(material.vertexShader).toContain('transpose( inverse( mat3( instanceMatrix ) ) )')
    material.dispose()
  })
})
