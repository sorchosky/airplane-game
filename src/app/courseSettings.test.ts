import { describe, expect, it } from 'vitest'
import { loadCourseSettings, parseCourseSettings } from './courseSettings'

describe('course settings', () => {
  it('parses only supported persisted values', () => {
    expect(parseCourseSettings(null).courseRings).toBe('next3')
    expect(parseCourseSettings('{bad').courseRings).toBe('next3')
    expect(parseCourseSettings('{"courseRings":"all"}').courseRings).toBe('all')
    expect(parseCourseSettings('{"courseRings":"none"}').courseRings).toBe('next3')
  })

  it('lets the all URL flag override persistence', () => {
    const storage = { getItem: () => '{"courseRings":"next3"}' }
    expect(loadCourseSettings(storage, '?rings=all').courseRings).toBe('all')
  })
})
