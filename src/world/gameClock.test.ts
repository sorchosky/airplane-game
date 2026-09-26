import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CYCLE_SECONDS,
  FIRST_FLIGHT_MINUTES,
  HALF_HOURS_PER_DAY,
  MINUTES_PER_DAY,
  advanceMinutes,
  formatClock,
  halfHourIndex,
  loadClockMinutes,
  parseClockTime,
  parseCycleSeconds,
  resolveClockConfig,
  saveClockMinutes,
  todClockMinutes,
} from './gameClock'

/** Steps the clock the way the frame loop does: many small real-time steps. */
function run(start: number, seconds: number, cycle: number, dt = 1 / 60): number {
  let minutes = start
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) minutes = advanceMinutes(minutes, dt, cycle)
  return minutes
}

describe('advanceMinutes', () => {
  it('runs 24 in-game hours in 5 real minutes', () => {
    expect(DEFAULT_CYCLE_SECONDS).toBe(300)
    expect(advanceMinutes(0, 150, DEFAULT_CYCLE_SECONDS)).toBeCloseTo(720)
    expect(advanceMinutes(0, 1, DEFAULT_CYCLE_SECONDS)).toBeCloseTo(MINUTES_PER_DAY / 300)
  })

  it('makes each half hour last 6.25 s', () => {
    expect(advanceMinutes(0, 6.25, DEFAULT_CYCLE_SECONDS)).toBeCloseTo(30)
  })

  it('comes back to the start after one loop of frame-sized steps', () => {
    const end = run(FIRST_FLIGHT_MINUTES, 300, DEFAULT_CYCLE_SECONDS)
    expect(end).toBeCloseTo(FIRST_FLIGHT_MINUTES, 6)
  })

  it('wraps at midnight', () => {
    expect(advanceMinutes(1435, 1.25, DEFAULT_CYCLE_SECONDS)).toBeCloseTo(1)
    expect(advanceMinutes(1439.9, 300, DEFAULT_CYCLE_SECONDS)).toBeCloseTo(1439.9)
  })

  it('follows a loop length changed by ?cycle=', () => {
    const cycle = resolveClockConfig('?cycle=20', null, false).cycleSeconds
    expect(cycle).toBe(20)
    expect(advanceMinutes(0, 10, cycle)).toBeCloseTo(720)
    expect(run(0, 20, cycle)).toBeCloseTo(0, 6)
  })

  it('is continuous: a frame step never moves more than the time it covers', () => {
    const dt = 1 / 60
    const perFrame = (dt * MINUTES_PER_DAY) / DEFAULT_CYCLE_SECONDS
    let minutes = 29.9
    const next = advanceMinutes(minutes, dt, DEFAULT_CYCLE_SECONDS)
    expect(next - minutes).toBeCloseTo(perFrame)
    minutes = next
    expect(minutes % 30).not.toBe(0)
  })
})

describe('formatClock', () => {
  it('shows every half-hour boundary as HH:MM, 48 distinct values', () => {
    const seen: string[] = []
    for (let i = 0; i < HALF_HOURS_PER_DAY; i++) {
      const minutes = i * 30
      const label = formatClock(minutes)
      const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
      const mm = minutes % 60 === 0 ? '00' : '30'
      expect(label).toBe(`${hh}:${mm}`)
      // Just before the boundary still reads the previous half hour.
      if (i > 0) expect(formatClock(minutes - 0.001)).toBe(seen[i - 1])
      seen.push(label)
    }
    expect(new Set(seen).size).toBe(48)
    expect(seen[0]).toBe('00:00')
    expect(seen[47]).toBe('23:30')
  })

  it('floors to the half hour', () => {
    expect(formatClock(7 * 60 + 29.99)).toBe('07:00')
    expect(formatClock(7 * 60 + 30)).toBe('07:30')
  })

  it('wraps from 23:30 to 00:00', () => {
    const before = 1439.5
    expect(formatClock(before)).toBe('23:30')
    const after = advanceMinutes(before, 1, DEFAULT_CYCLE_SECONDS)
    expect(formatClock(after)).toBe('00:00')
    expect(halfHourIndex(after)).toBe(0)
    expect(formatClock(MINUTES_PER_DAY)).toBe('00:00')
  })

  it('ticks 48 times per loop when stepped frame by frame', () => {
    // Mid half hour, so float drift over 18,000 steps can't straddle the start boundary.
    let minutes = 15
    let ticks = 0
    let last = halfHourIndex(minutes)
    for (let i = 0; i < 300 * 60; i++) {
      minutes = advanceMinutes(minutes, 1 / 60, DEFAULT_CYCLE_SECONDS)
      const index = halfHourIndex(minutes)
      if (index !== last) ticks += 1
      last = index
    }
    expect(ticks).toBe(48)
  })
})

describe('URL flags', () => {
  it('parses ?time=HH:MM', () => {
    expect(parseClockTime('07:00')).toBe(420)
    expect(parseClockTime('7:30')).toBe(450)
    expect(parseClockTime('23:59')).toBe(1439)
    expect(parseClockTime('24:00')).toBeNull()
    expect(parseClockTime('12:60')).toBeNull()
    expect(parseClockTime('noon')).toBeNull()
    expect(parseClockTime(null)).toBeNull()
  })

  it('maps ?tod= phases onto clock times', () => {
    expect(todClockMinutes('morning')).toBe(420)
    expect(todClockMinutes('golden')).toBe(todClockMinutes('golden-hour'))
    expect(todClockMinutes('NIGHT')).toBe(0)
    expect(todClockMinutes('teatime')).toBeNull()
  })

  it('accepts only a positive ?cycle=', () => {
    expect(parseCycleSeconds('20')).toBe(20)
    expect(parseCycleSeconds('0')).toBeNull()
    expect(parseCycleSeconds('-5')).toBeNull()
    expect(parseCycleSeconds('fast')).toBeNull()
    expect(parseCycleSeconds('')).toBeNull()
    expect(parseCycleSeconds(null)).toBeNull()
  })
})

describe('resolveClockConfig', () => {
  it('opens a first flight at 07:00', () => {
    expect(resolveClockConfig('', null, false)).toEqual({
      minutes: 420,
      pinned: false,
      cycleSeconds: 300,
    })
  })

  it('resumes from the saved time', () => {
    expect(resolveClockConfig('', 1000.5, false).minutes).toBe(1000.5)
  })

  it('pins ?time= over ?tod= over ?shot=', () => {
    expect(resolveClockConfig('?time=13:30&tod=night', 900, true)).toMatchObject({
      minutes: 810,
      pinned: true,
    })
    expect(resolveClockConfig('?tod=dusk', 900, true)).toMatchObject({
      minutes: 19 * 60 + 30,
      pinned: true,
    })
    expect(resolveClockConfig('?shot=spawn', 100, true)).toMatchObject({
      minutes: 420,
      pinned: true,
    })
  })

  it('ignores an invalid ?time=', () => {
    expect(resolveClockConfig('?time=99:99', 100, false)).toMatchObject({
      minutes: 100,
      pinned: false,
    })
  })
})

describe('persistence', () => {
  function memoryStorage() {
    const items = new Map<string, string>()
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    }
  }

  it('round-trips the saved time', () => {
    const storage = memoryStorage()
    expect(loadClockMinutes(storage)).toBeNull()
    saveClockMinutes(storage, 812.25)
    expect(loadClockMinutes(storage)).toBe(812.25)
  })

  it('survives blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(loadClockMinutes(blocked)).toBeNull()
    expect(() => saveClockMinutes(blocked, 10)).not.toThrow()
    expect(loadClockMinutes(undefined)).toBeNull()
  })

  it('rejects a corrupt saved value', () => {
    expect(loadClockMinutes({ getItem: () => 'abc' })).toBeNull()
    expect(loadClockMinutes({ getItem: () => '1500' })).toBe(60)
  })
})
