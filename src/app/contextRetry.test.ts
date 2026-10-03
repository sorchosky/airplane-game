import { describe, expect, it } from 'vitest'
import {
  CONTEXT_BOOT_RETRIES,
  CONTEXT_RETRY_BASE_MS,
  CONTEXT_RETRY_MAX_MS,
  contextRetryDelayMs,
} from './contextRetry'

describe('contextRetryDelayMs', () => {
  it('remounts a single loss at once', () => {
    expect(contextRetryDelayMs(1, true)).toBe(0)
  })

  it('backs off by doubling from the base once a canvas fails again', () => {
    expect(contextRetryDelayMs(2, true)).toBe(CONTEXT_RETRY_BASE_MS)
    expect(contextRetryDelayMs(3, true)).toBe(CONTEXT_RETRY_BASE_MS * 2)
    expect(contextRetryDelayMs(4, true)).toBe(CONTEXT_RETRY_BASE_MS * 4)
  })

  it('caps the wait', () => {
    expect(contextRetryDelayMs(20, true)).toBe(CONTEXT_RETRY_MAX_MS)
  })

  it('keeps trying once the world has drawn', () => {
    expect(contextRetryDelayMs(100, true)).toBe(CONTEXT_RETRY_MAX_MS)
  })

  it('gives up on a world that never drew', () => {
    expect(contextRetryDelayMs(CONTEXT_BOOT_RETRIES, false)).not.toBeNull()
    expect(contextRetryDelayMs(CONTEXT_BOOT_RETRIES + 1, false)).toBeNull()
  })
})
