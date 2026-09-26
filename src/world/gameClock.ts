/**
 * In-game clock (#94): a 24-hour day in 5 real minutes, shown in half-hour steps. The clock keeps
 * continuous time; only the readout is floored to the half hour, so the day cycle (#92) reads a
 * smooth value and colours never step at a tick. Pure: no React, DOM or store imports.
 *
 * Time is in-game minutes since midnight, `0 <= minutes < MINUTES_PER_DAY`.
 */

export const MINUTES_PER_DAY = 1440
export const HALF_HOUR_MINUTES = 30
/** Distinct readout values per loop: `00:00` … `23:30`. */
export const HALF_HOURS_PER_DAY = MINUTES_PER_DAY / HALF_HOUR_MINUTES
/** Real seconds per in-game day. `?cycle=<seconds>` overrides it. */
export const DEFAULT_CYCLE_SECONDS = 300
/** The very first flight opens on the approved morning look (palette B, #64). */
export const FIRST_FLIGHT_MINUTES = 7 * 60

/**
 * Clock time `?tod=<phase>` pins, one per phase in #92's table plus #64's `golden` alias. Roughly
 * the middle of each phase, so a pinned capture lands on that phase's look.
 */
const TOD_MINUTES: Record<string, number> = {
  morning: 7 * 60,
  day: 12 * 60,
  afternoon: 16 * 60 + 30,
  golden: 18 * 60 + 30,
  'golden-hour': 18 * 60 + 30,
  goldenhour: 18 * 60 + 30,
  dusk: 19 * 60 + 30,
  night: 0,
}

/** Wraps any minute count into `[0, MINUTES_PER_DAY)`. */
export function wrapMinutes(minutes: number): number {
  const wrapped = minutes % MINUTES_PER_DAY
  return wrapped < 0 ? wrapped + MINUTES_PER_DAY : wrapped
}

/** Clock time after `deltaSeconds` of real time, at one day per `cycleSeconds`. */
export function advanceMinutes(
  minutes: number,
  deltaSeconds: number,
  cycleSeconds: number,
): number {
  return wrapMinutes(minutes + (deltaSeconds * MINUTES_PER_DAY) / cycleSeconds)
}

/** Which half hour of the day `minutes` falls in, `0 .. HALF_HOURS_PER_DAY - 1`. */
export function halfHourIndex(minutes: number): number {
  return Math.floor(wrapMinutes(minutes) / HALF_HOUR_MINUTES) % HALF_HOURS_PER_DAY
}

const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value))

/** The readout: `minutes` floored to the half hour, as `HH:MM`. */
export function formatClock(minutes: number): string {
  const total = halfHourIndex(minutes) * HALF_HOUR_MINUTES
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
}

/** `HH:MM` (24-hour, `H:MM` allowed) to minutes since midnight, or null if it isn't a valid time. */
export function parseClockTime(value: string | null): number | null {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const mins = Number(match[2])
  if (hours > 23 || mins > 59) return null
  return hours * 60 + mins
}

/** Clock time a `?tod=<phase>` value pins, or null for an unknown phase. */
export function todClockMinutes(value: string | null): number | null {
  return TOD_MINUTES[value?.trim().toLowerCase() ?? ''] ?? null
}

/** `?cycle=<seconds>` as a positive finite loop length, or null. */
export function parseCycleSeconds(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

export interface ClockConfig {
  /** Where the clock starts this page load. */
  minutes: number
  /** A pinned clock never advances and never saves over the player's progress. */
  pinned: boolean
  cycleSeconds: number
}

/**
 * Starting clock for this page load. Pins, strongest first: `?time=HH:MM`, `?tod=<phase>`, then a
 * `?shot=` capture, which pins the default morning time so bookmarks stay daytime. Otherwise the
 * clock resumes from `saved` (the last flight's time), or 07:00 on a first flight.
 */
export function resolveClockConfig(
  search: string,
  saved: number | null,
  shotActive: boolean,
): ClockConfig {
  const params = new URLSearchParams(search)
  const cycleSeconds = parseCycleSeconds(params.get('cycle')) ?? DEFAULT_CYCLE_SECONDS
  const pin =
    parseClockTime(params.get('time')) ??
    todClockMinutes(params.get('tod')) ??
    (shotActive ? FIRST_FLIGHT_MINUTES : null)
  if (pin !== null) return { minutes: pin, pinned: true, cycleSeconds }
  return { minutes: saved ?? FIRST_FLIGHT_MINUTES, pinned: false, cycleSeconds }
}

const STORAGE_KEY = 'skyborne.clock.minutes'

/** Same load/save shape as `audio/audioSettings.ts`: storage as a param, and a try/catch. */
export function loadClockMinutes(storage: Pick<Storage, 'getItem'> | undefined): number | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (raw === null || raw === undefined) return null
    const minutes = Number(raw)
    return Number.isFinite(minutes) ? wrapMinutes(minutes) : null
  } catch {
    return null
  }
}

export function saveClockMinutes(
  storage: Pick<Storage, 'setItem'> | undefined,
  minutes: number,
): void {
  try {
    storage?.setItem(STORAGE_KEY, String(minutes))
  } catch {
    // Quota or privacy mode: the clock still runs for this session, it just won't carry over.
  }
}
