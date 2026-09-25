import { describe, expect, it } from 'vitest'
import { POST_FX, postFxConfig } from './postFx'

describe('postFxConfig', () => {
  it('low disables post entirely', () => {
    expect(postFxConfig('low').enabled).toBe(false)
  })

  it('medium is bloom only, at half resolution', () => {
    expect(postFxConfig('medium')).toEqual({
      enabled: true,
      bloomResolutionScale: 0.5,
      grade: false,
      vignette: false,
    })
  })

  it('high is everything at full resolution', () => {
    expect(postFxConfig('high')).toEqual({
      enabled: true,
      bloomResolutionScale: 1,
      grade: true,
      vignette: true,
    })
  })
})

describe('POST_FX', () => {
  it('keeps the bloom threshold high enough that only highlights glow', () => {
    // Most of the sky is ~0.38 and sunlit terrain/plane ~0.25 linear luminance; bloom, knee
    // included, must start above both so only the sun and its glow bloom.
    expect(POST_FX.bloom.threshold - POST_FX.bloom.smoothing).toBeGreaterThan(0.3)
  })
})
